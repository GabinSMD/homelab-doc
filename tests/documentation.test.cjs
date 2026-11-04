const test = require('node:test');
const assert = require('node:assert/strict');
const {extractSections} = require('../plugins/search-index');
const {searchRecords, highlightParts} = require('../src/utils/search.cjs');
const {filterServices} = require('../src/utils/catalogue.cjs');
const services = require('../src/data/service-catalogue.json');
const {documentKind, validVerificationDate, validateMetadata} = require('../src/utils/doc-kind.cjs');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

test('plugin carries document metadata into postBuild and skips drafts', async () => {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'homelab-search-'));
  try {
    await fs.mkdir(path.join(outDir, 'services', 'dns'), {recursive: true});
    await fs.writeFile(path.join(outDir, 'services', 'dns', 'index.html'), '<div class="theme-doc-markdown"><h1>DNS</h1><p>Introduction</p><h2 id="configuration">Configuration</h2><h3>Sans ancre</h3><p>Commande</p></div>');
    const plugin = require('../plugins/search-index')();
    await plugin.allContentLoaded({allContent: {'docusaurus-plugin-content-docs': {default: {loadedVersions: [{docs: [
      {id: 'services/dns', title: 'DNS', permalink: '/lab/services/dns', frontMatter: {}},
      {id: 'draft', draft: true, frontMatter: {}},
      {id: 'unlisted', unlisted: true, frontMatter: {}},
      {id: 'noindex', frontMatter: {noindex: true}},
    ]}]}}}});
    await plugin.postBuild({outDir, baseUrl: '/lab/'});
    const index = JSON.parse(await fs.readFile(path.join(outDir, 'search-index.json'), 'utf8'));
    assert.equal(index.documents, 1);
    assert.equal(index.records.length, 2);
    assert.equal(index.records[1].url, '/lab/services/dns#configuration');
    assert.match(index.records[1].text, /Sans ancre Commande/);
  } finally {await fs.rm(outDir, {recursive: true, force: true});}
});

test('HTML indexing preserves anchors, code and inactive tabs without indexing controls', () => {
  const html = `<nav>Navigation parasite</nav><div class="theme-doc-markdown"><h1>DNS</h1><p>Introduction</p><h2 id="vérifier-le-dns">Vérifier le DNS<a class="hash-link">#</a></h2><div><p>Résolution locale</p><pre><code>dig example.org</code><button>Copier</button></pre><div role="tabpanel" hidden>Commande secondaire nslookup</div></div><dialog class="homelab-diagram-dialog">Zoom parasite</dialog></div>`;
  const records = extractSections(html, {id: 'services/dns', title: 'DNS', permalink: '/services/dns/'});
  assert.equal(records.length, 2);
  assert.equal(records[1].url, '/services/dns/#v%C3%A9rifier-le-dns');
  assert.equal(records[1].text, 'Résolution locale dig example.org Commande secondaire nslookup');
  assert.equal(records[1].category, 'Services');
  assert.equal(searchRecords(records, 'RESOLUTION nslookup').length, 1);
  assert.equal(searchRecords(records, 'parasite').length, 0);
});

test('search requires every term, ranks headings and excerpts matching commands', () => {
  const records = [
    {title: 'Sauvegardes', heading: 'Diagnostic', category: 'Exploitation', url: '/backups/', text: `${'Introduction. '.repeat(40)}restic snapshots --latest 1`},
    {title: 'Restic snapshots', heading: 'Commandes', category: 'Guides', url: '/restic/', text: 'Lister les sauvegardes.'},
  ];
  assert.deepEqual(searchRecords(records, 'restic snapshots').map((r) => r.url), ['/restic/', '/backups/']);
  assert.match(searchRecords(records, '--latest')[0].excerpt, /restic snapshots --latest 1/);
  assert.equal(searchRecords(records, 'restic inexistant').length, 0);
  assert.deepEqual(searchRecords(records, '  '), []);
});

test('introductory text before the title does not create duplicate result URLs', () => {
  const records = extractSections('<div class="theme-doc-markdown"><p>HOMELAB</p><h1>Documentation</h1><p>Bienvenue</p></div>', {id: 'index', title: 'Documentation', permalink: '/'});
  assert.equal(records.length, 1);
  assert.equal(records[0].text, 'HOMELAB Bienvenue');
});

test('operational verification is explicit, dated and explained', () => {
  assert.equal(documentKind('services/traefik'), 'service');
  assert.equal(documentKind('operations/monitoring'), 'reference');
  assert.equal(documentKind('operations/break-glass'), 'runbook');
  assert.equal(documentKind('guides/index', {doc_type: 'reference'}), 'reference');
  assert.equal(validVerificationDate('2024-02-29'), true);
  for (const date of ['2025-02-29', '2026-13-01', 'today', new Date()]) assert.equal(validVerificationDate(date), false);
  assert.doesNotThrow(() => validateMetadata({}));
  assert.doesNotThrow(() => validateMetadata({doc_type: 'guide', verified_at: '2024-02-29', verification_note: 'Test sur environnement isolé', related_docs: [['Sauvegardes', '/operations/backups/']]}));
  for (const metadata of [{doc_type: 'invalid'}, {verified_at: '2024-02-29'}, {verification_note: 'Test'}, {related_docs: [['Lien', '//example.org']]}]) assert.throws(() => validateMetadata(metadata));
});

test('current documentation precedes archives and scopes remain independently searchable', () => {
  const records = [
    {title: 'Restic snapshots', heading: 'Restic', text: 'restic snapshots', category: 'Projet', url: '/old/', archived: true},
    {title: 'Sauvegardes', heading: 'Commandes', text: 'restic snapshots', category: 'Exploitation', url: '/current/', archived: false},
  ];
  assert.deepEqual(searchRecords(records, 'restic', 'all').map((r) => r.url), ['/current/', '/old/']);
  assert.deepEqual(searchRecords(records, 'restic', 'current').map((r) => r.url), ['/current/']);
  assert.deepEqual(searchRecords(records, 'restic', 'archives').map((r) => r.url), ['/old/']);
  const html = '<div class="theme-doc-markdown"><h1>Titre</h1><p>Contenu</p></div>';
  assert.equal(extractSections(html, {id: 'projet/journal/2026-08-26-drill', title: 'Drill', permalink: '/drill/'} )[0].archiveDate, '2026-08-26');
  const retired = extractSections(html, {id: 'services/beszel', title: 'Beszel', permalink: '/services/beszel/'} )[0];
  assert.equal(retired.archived, true);
  assert.equal(retired.archiveDate, '2026-11-03');
  assert.equal(extractSections(html, {id: 'services/pulse', title: 'Pulse', permalink: '/services/pulse/'} )[0].archived, false);
  assert.equal(extractSections(html, {id: 'projet/sucre', title: 'Sucre', permalink: '/projet/sucre/', frontMatter: {search_status: 'archive'}})[0].archived, true);
});

test('highlighting preserves text, accents, combining marks and literal markup', () => {
  for (const text of ['Réseau et sécurité', 'Re\u0301seau et sécurité', '🔎 <script>réseau</script>']) {
    const parts = highlightParts(text, 'reseau');
    assert.equal(parts.map((part) => part.text).join(''), text);
    assert.match(parts.filter((part) => part.match).map((part) => part.text).join(''), /[Rr][ée]/);
  }
  assert.deepEqual(highlightParts('restic snapshots', 'rest restic'), [{text: 'restic', match: true}, {text: ' snapshots', match: false}]);
  assert.deepEqual(highlightParts('Texte', '   '), [{text: 'Texte', match: false}]);
});

test('catalogue filters combine machine and accent-insensitive role; retired status feeds search', () => {
  assert.deepEqual(filterServices(services, {host: 'galahad', query: 'dns'}).map((entry) => entry.id), ['dns-failover']);
  assert.equal(filterServices(services, {host: 'lancelot', query: 'vaultwarden'}).length, 0);
  assert.equal(filterServices(services, {query: 'RESEAU'}).some((entry) => entry.id === 'adguard'), true);
  assert.equal(filterServices(services, {query: 'beszel'})[0].status, 'retired');
  assert.equal(new Set(services.map((entry) => entry.id)).size, services.length);
  for (const entry of services) {
    assert.ok(['active', 'test', 'retired'].includes(entry.status));
    assert.ok(entry.hosts.length && entry.hosts.every((host) => ['penny', 'galahad', 'lancelot'].includes(host)));
    if (entry.status === 'retired') assert.ok(validVerificationDate(entry.retiredAt));
  }
});
