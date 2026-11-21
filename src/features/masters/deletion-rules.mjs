import { masterReferences } from './master-references.mjs';

// Check both the working copy and the last approved copy of dependent masters.
export function deletionProblem(record, dependents) {
  for (const dependent of dependents) {
    if (dependent.id === record.id || ['deleted','inactive'].includes(dependent.status)) continue;
    if (record.master === 'location-master' && dependent.master === 'storage-location-master'
      && dependent.values.Location === record.code) return 'Delete or deactivate this location’s storage records first.';
    for (const [field, source] of Object.entries(masterReferences[dependent.master] ?? {})) {
      if (source.master === record.master && dependent.values[field]
        && dependent.values[field] === source.choice(record)[0]) {
        return `This record is used by ${dependent.code}. Update or retire that record first.`;
      }
    }
  }
}
