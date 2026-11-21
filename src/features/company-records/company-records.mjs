import { createHash } from 'node:crypto';
import { masterDefinition } from '../masters/records-fields.mjs';
import accounts from './account-master-data.mjs';
import storageLocations from './storage-location-master-data.mjs';

// Records the company supplied from the iBoss ERP. Every signed-in person sees them in the master's
// list, read-only and already approved. They are not checked against the form's required fields,
// because the ERP sheets do not carry all of them.
const loadedAt = '2026-11-21T00:00:00.000Z';
const sources = {
  'storage-location-master': { rows: storageLocations, name: 'Storage Loc. Name', site: 'Location' },
  'account-master': { rows: accounts, name: 'A/C Name' },
};
const normalize = value => String(value ?? '').trim().normalize('NFKC').toLowerCase();

const records = new Map(Object.entries(sources).map(([slug, { rows, name, site }]) => {
  const definition = masterDefinition(slug);
  const known = new Set(definition.fields.map(field => field.key));
  return [slug, rows.map(values => {
    const unknown = Object.keys(values).find(key => !known.has(key));
    if (unknown) throw new Error(`${definition.name} has no field "${unknown}".`);
    const code = values[definition.codeField];
    return {
      id: createHash('sha256').update('company-record\n' + slug + '\n' + normalize(code)).digest('hex'),
      master: slug, code, name: values[name], site: site ? values[site] : '', status: 'approved', revision: 1,
      values, updatedAt: loadedAt, editedBy: 'iBoss ERP', companyRecord: true,
    };
  }).sort((first, second) => first.code.localeCompare(second.code, 'en', { numeric: true }))];
}));

export function companyRecords(slug, search = '') {
  const query = normalize(search);
  return (records.get(slug) ?? []).filter(record => normalize(record.code).includes(query) || normalize(record.name).includes(query));
}

export const companyRecord = (slug, id) => (records.get(slug) ?? []).find(record => record.id === id) ?? null;
