export function draftKey({ actor, site, slug, record }) {
  return 'diesel-master-draft:' + [actor, site, slug, record || 'new'].map(encodeURIComponent).join(':');
}

export function readDraft(raw, revision) {
  if (!raw) return null;
  const draft = JSON.parse(raw);
  if (draft.version !== 1 || typeof draft.savedAt !== 'string' || !Number.isFinite(Date.parse(draft.savedAt))
    || !draft.values || typeof draft.values !== 'object' || Array.isArray(draft.values)
    || Object.values(draft.values).some(value => typeof value !== 'string')
    || !Array.isArray(draft.files) || draft.files.some(value => typeof value !== 'string')) {
    throw new Error('This local draft could not be read.');
  }
  return { ...draft, stale: String(draft.revision) !== String(revision) };
}
