// Shared by the search UI and its Node tests. Queries never leave the browser.
function normalize(text) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr');
}

function searchRecords(records, query, scope = 'all') {
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return records.map((record) => {
    if (scope === 'current' && record.archived || scope === 'archives' && !record.archived) return null;
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
  }).filter(Boolean).sort((a, b) => Number(Boolean(a.archived)) - Number(Boolean(b.archived)) || b.score - a.score || a.title.localeCompare(b.title, 'fr'));
}

// Map accent-insensitive matches back to the original Unicode string.
// React renders these parts as text; the query is never interpreted as HTML.
function highlightParts(text, query) {
  const terms = [...new Set(normalize(query).trim().split(/\s+/).filter(Boolean))];
  if (!terms.length) return [{text, match: false}];
  let normalized = '', offset = 0;
  const positions = [];
  for (const character of text) {
    const plain = normalize(character);
    normalized += plain;
    for (let i = 0; i < plain.length; i++) positions.push({start: offset, end: offset + character.length});
    // Include a following combining mark in the preceding original character.
    if (!plain && positions.length) positions[positions.length - 1].end = offset + character.length;
    offset += character.length;
  }
  const ranges = [];
  for (const term of terms) {
    let from = 0, at;
    while ((at = normalized.indexOf(term, from)) !== -1) {
      ranges.push([positions[at].start, positions[at + term.length - 1].end]);
      from = at + term.length;
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  const parts = []; let cursor = 0;
  for (const [start, end] of merged) {
    if (start > cursor) parts.push({text: text.slice(cursor, start), match: false});
    parts.push({text: text.slice(start, end), match: true}); cursor = end;
  }
  if (cursor < text.length) parts.push({text: text.slice(cursor), match: false});
  return parts;
}

module.exports = {normalize, searchRecords, highlightParts};
