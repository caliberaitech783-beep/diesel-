import { masters } from './catalog.mjs';

export class MasterRecordError extends Error {
  constructor(message, status = 422) {
    super(message);
    this.status = status;
  }
}

const identityFields = {
  'item-master': ['Item Code', 'Item Name'],
  'location-master': ['Location Code', 'Location Name'],
  'storage-location-master': ['Storage Loc Code', 'Storage Loc. Name'],
};
export const recordMasters = Object.keys(identityFields);

export function masterDefinition(slug) {
  const master = masters.find(item => item.slug === slug);
  if (!master) throw new MasterRecordError('Unknown master.', 404);
  const labels = master.sections.flatMap(section => section.fields.map(field => field.label));
  const fields = master.sections.flatMap(section => section.fields.map(field => ({
    ...field, ...(field.label === 'Status' ? { options: ['Active', 'Inactive'] } : {}),
    ...(slug === 'storage-location-master' && field.key === 'storage-type' ? { options: field.suggestions } : {}),
    section: section.name,
    key: labels.indexOf(field.label) === labels.lastIndexOf(field.label) ? field.label : section.name + ' / ' + field.label,
    controlKey: field.key,
  })));
  return { ...master, fields, codeField: identityFields[slug]?.[0] };
}

export function recordIdentity(slug, values) {
  const [codeKey, nameKey] = identityFields[slug];
  const code = values[codeKey];
  const name = values[nameKey];
  if (!code || !name || code.length > 512 || name.length > 1024) throw new MasterRecordError('Enter a valid record code and name.');
  return { code, name };
}

export function validateScalar(field, raw) {
  if (typeof raw !== 'string' && typeof raw !== 'number') throw new MasterRecordError(field.label + ' needs a text or number value.');
  const value = String(raw).trim();
  if (!value) return '';
  if (value.length > (field.type === 'textarea' ? 65536 : 1024)) throw new MasterRecordError(field.label + ' exceeds the field length.');
  if (field.options && !field.options.includes(value)) throw new MasterRecordError('Choose a listed value for ' + field.label + '.');
  if (field.type === 'number') {
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value) || !Number.isFinite(Number(value))) throw new MasterRecordError(field.label + ' must be a finite number.');
    if (field.step === 1 && !Number.isSafeInteger(Number(value))) throw new MasterRecordError(field.label + ' must be a whole number.');
  }
  if (field.type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) {
    throw new MasterRecordError(field.label + ' must be a valid date.');
  }
  if (field.type === 'time' && !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)) throw new MasterRecordError(field.label + ' must be a valid time.');
  if (field.type === 'email' && !/^[^\s@]+@[^\s@]+$/.test(value)) throw new MasterRecordError(field.label + ' must be an email address.');
  return value;
}
