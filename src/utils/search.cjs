// Shared by the search UI and its Node tests. Queries never leave the browser.
function normalize(text) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr');
}

function searchRecords(records, query) {
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return records.map((record) => {
    const title = normalize(`${record.title} ${record.heading}`);
    const content = normalize(record.text);
    const searchable = `${title} ${normalize(record.category)} ${content}`;
    if (!terms.every((term) => searchable.includes(term))) return null;
    const score = terms.reduce((total, term) => total + (title.includes(term) ? 5 : 1), 0);
    const phrase = content.indexOf(terms.join(' '));
    const position = phrase >= 0 ? phrase : Math.max(0, ...terms.map((term) => content.indexOf(term)));
    const start = Math.max(0, position - 55);
    const excerpt = `${start ? '…' : ''}${record.text.slice(start, start + 220)}${record.text.length > start + 220 ? '…' : ''}`;
    return {...record, score, excerpt};
  }).filter(Boolean).sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'fr'));
}

module.exports = {normalize, searchRecords};
