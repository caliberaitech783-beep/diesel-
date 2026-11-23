import { createHash } from 'node:crypto';
import { masterDefinition } from '../masters/records-fields.mjs';
import accounts from './account-master-data.mjs';
import storageLocations from './storage-location-master-data.mjs';
import taxWorkbook from '../tax-masters/erp-tax-data.mjs';

// Company workbook records appear for signed-in users. Source blanks remain blank;
// the tax workbook is imported reference data rather than approved Entry configuration.
const loadedAt = '2026-11-21T00:00:00.000Z';
const sources = {
  'storage-location-master': { rows: storageLocations, name: 'Storage Loc. Name', site: 'Location' },
  'account-master': { rows: accounts, name: 'A/C Name' },
  'gst-master': { rows: taxWorkbook.GST.rows, name: 'Tax_Description', status: 'imported', source: taxWorkbook.source, loadedAt: taxWorkbook.importedAt },
  'tax-master-tds': { rows: taxWorkbook.TDS.rows, name: 'Nature_of_Payment', status: 'imported', source: taxWorkbook.source, loadedAt: taxWorkbook.importedAt },
};
const normalize = value => String(value ?? '').trim().normalize('NFKC').toLowerCase();

const records = new Map(Object.entries(sources).map(([slug, { rows, name, site, status = 'approved', source = 'iBoss ERP', loadedAt: sourceDate = loadedAt }]) => {
  const definition = masterDefinition(slug);
  const known = new Set(definition.fields.map(field => field.key));
  return [slug, rows.map(values => {
    const unknown = Object.keys(values).find(key => !known.has(key));
    if (unknown) throw new Error(`${definition.name} has no field "${unknown}".`);
    const code = values[definition.codeField];
    return {
      id: createHash('sha256').update('company-record\n' + slug + '\n' + normalize(code)).digest('hex'),
      master: slug, code, name: values[name], site: site ? values[site] : '', status, revision: 1,
      values, updatedAt: sourceDate, editedBy: source, companyRecord: true,
    };
  }).sort((first, second) => first.code.localeCompare(second.code, 'en', { numeric: true }))];
}));

export function companyRecords(slug, search = '') {
  const query = normalize(search);
  return (records.get(slug) ?? []).filter(record => normalize(record.code).includes(query) || normalize(record.name).includes(query));
}

export const companyRecord = (slug, id) => (records.get(slug) ?? []).find(record => record.id === id) ?? null;
