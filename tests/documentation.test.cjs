const test = require('node:test');
const assert = require('node:assert/strict');
const {extractSections} = require('../plugins/search-index');
const {searchRecords} = require('../src/utils/search.cjs');
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
