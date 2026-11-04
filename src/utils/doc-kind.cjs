const kinds = {service: 'Fiche service', guide: 'Guide pas à pas', runbook: 'Procédure d’intervention', reference: 'Référence', journal: 'Journal du lab'};
function documentKind(id, frontMatter = {}) {
  if (kinds[frontMatter.doc_type]) return frontMatter.doc_type;
  if (id.startsWith('services/') && id !== 'services/index') return 'service';
  if (id.startsWith('guides/') && id !== 'guides/index') return 'guide';
  if (['operations/break-glass', 'operations/forgejo-acces-urgence', 'operations/depannage', 'operations/dr-drill-scenario-1'].includes(id)) return 'runbook';
  if (id.startsWith('projet/journal/')) return 'journal';
  return 'reference';
}
function validVerificationDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function validateMetadata(frontMatter = {}) {
  if (frontMatter.doc_type != null && !Object.hasOwn(kinds, frontMatter.doc_type)) throw new Error('Unknown doc_type');
  if (frontMatter.verified_at != null && !validVerificationDate(frontMatter.verified_at)) throw new Error('verified_at must be a quoted YYYY-MM-DD date');
  if (frontMatter.verified_at != null && (typeof frontMatter.verification_note !== 'string' || !frontMatter.verification_note.trim())) throw new Error('verified_at requires a verification_note describing the check');
  if (frontMatter.verification_note != null && frontMatter.verified_at == null) throw new Error('verification_note requires verified_at');
  if (frontMatter.related_docs != null && (!Array.isArray(frontMatter.related_docs) || !frontMatter.related_docs.every((entry) => Array.isArray(entry) && entry.length === 2 && entry.every((value) => typeof value === 'string' && value.trim()) && /^\/(?!\/)/.test(entry[1])))) throw new Error('related_docs must contain [label, internal path] pairs');
}
module.exports = {kinds, documentKind, validVerificationDate, validateMetadata};
