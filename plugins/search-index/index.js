const fs = require('node:fs/promises');
const path = require('node:path');
const cheerio = require('cheerio');
const {validateMetadata} = require('../../src/utils/doc-kind.cjs');
const catalogue = require('../../src/data/service-catalogue.json');

const categories = {architecture: 'Infrastructure', services: 'Services', operations: 'Exploitation', guides: 'Guides', securite: 'Sécurité', projet: 'Projet'};
const compact = (text) => text.replace(/\s+/g, ' ').trim();

// Index rendered HTML, not Markdown: titles, MDX, tab content and anchors are
// exactly those shipped to readers. Only canonical docs enter the index.
function extractSections(html, doc) {
  const $ = cheerio.load(html);
  const article = $('.theme-doc-markdown').first();
  article.find('script, style, button, .hash-link, .homelab-no-search, .mermaid, .homelab-diagram-dialog, .homelab-diagram figcaption').remove();
  const records = [];
  const retired = catalogue.find((entry) => entry.status === 'retired' && entry.href.replace(/\/$/, '') === `/${doc.id}`);
  const journalDate = doc.id.match(/^projet\/journal\/(\d{4}-\d{2}-\d{2})/);
  const archived = Boolean(journalDate || retired || doc.frontMatter?.search_status === 'archive');
  const archiveDate = retired?.retiredAt || journalDate?.[1] || null;
  let heading = doc.title;
  let anchor = '';
  let fragments = [];
  function flush() {
    const text = compact(fragments.join(' '));
    if (text) {
      const url = doc.permalink + (anchor ? `#${encodeURIComponent(anchor)}` : '');
      const existing = records.find((record) => record.url === url);
      if (existing) existing.text += ` ${text}`;
      else records.push({title: doc.title, heading, category: categories[doc.id.split('/')[0]] || 'Documentation', url, text, archived, archiveDate});
    }
    fragments = [];
  }
  // One traversal avoids double-counting nested paragraphs, code and tables.
  function visit(node) {
    if (node.type === 'text') {fragments.push(node.data); return;}
    if (/^h[1-3]$/.test(node.name || '') && (node.name === 'h1' || $(node).attr('id'))) {
      flush(); heading = compact($(node).text()); anchor = $(node).attr('id') || '';
      return;
    }
    for (const child of node.children || []) visit(child);
  }
  for (const node of article.contents().toArray()) visit(node);
  flush();
  return records;
}

module.exports = function searchIndex() {
  let docs = [];
  return {
    name: 'homelab-search-index',
    async allContentLoaded({allContent}) {
      const versions = allContent['docusaurus-plugin-content-docs']?.default?.loadedVersions || [];
      docs = versions.flatMap((version) => version.docs).filter((doc) => !doc.draft && !doc.unlisted && !doc.frontMatter.noindex);
    },
    async postBuild({outDir, baseUrl}) {
      const records = [];
      for (const doc of docs) {
        try {validateMetadata(doc.frontMatter);} catch (error) {throw new Error(`${doc.id}: ${error.message}`);}
        const relative = decodeURIComponent(doc.permalink.slice(baseUrl.length));
        const html = await fs.readFile(path.join(outDir, relative, 'index.html'), 'utf8');
        records.push(...extractSections(html, doc));
      }
      if (!records.length) throw new Error('The documentation search index is empty.');
      await fs.writeFile(path.join(outDir, 'search-index.json'), JSON.stringify({version: 1, documents: docs.length, records}));
      console.log(`[homelab-search] ${docs.length} documents, ${records.length} sections indexed.`);
    },
  };
};
module.exports.extractSections = extractSections;
