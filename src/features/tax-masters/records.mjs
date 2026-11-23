import { companyRecord, companyRecords } from '../company-records/company-records.mjs';
import { MasterRecordError } from '../masters/records-fields.mjs';

export const taxMasters = new Set(['gst-master', 'tax-master-tds']);
export const taxSourceRecord = (slug, id) => taxMasters.has(slug) ? companyRecord(slug, id) : null;

export function withTaxSources(saved, slugs, { search = '', status = '', offset = 0, limit } = {}) {
  if (typeof search !== 'string' || search.length > 256 || !['', 'imported', 'approved', 'pending', 'returned', 'pending_deactivation', 'pending_deletion', 'inactive'].includes(status)) {
    throw new MasterRecordError('Choose a valid search or status.');
  }
  if (!Number.isSafeInteger(offset) || offset < 0 || (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1))) {
    throw new MasterRecordError('Invalid page.');
  }
  const codes = new Set(saved.map(record => record.master + '\n' + record.code.trim().toLowerCase()));
  const sources = slugs.filter(slug => taxMasters.has(slug)).flatMap(slug => companyRecords(slug))
    .filter(record => !codes.has(record.master + '\n' + record.code.trim().toLowerCase()))
    .map(record => ({...record, canEdit:false}));
  const query = search.trim().normalize('NFKC').toLowerCase();
  return [...saved, ...sources].filter(record => (!status || record.status === status)
    && [record.code, record.name].some(value => value.normalize('NFKC').toLowerCase().includes(query)))
    .sort((a,b) => a.master.localeCompare(b.master) || a.code.localeCompare(b.code, 'en', { numeric:true }) || a.id.localeCompare(b.id))
    .slice(offset, limit === undefined ? undefined : offset + limit);
}
