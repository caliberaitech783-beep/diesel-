import { createHash } from 'node:crypto';
import { masters } from './catalog.mjs';
import { legacyTaxSections, legacyTaxIdentity, percentageValue } from '../tax-masters/rules.mjs';

export class MasterRecordError extends Error {
  constructor(message, status = 422) {
    super(message);
    this.status = status;
  }
}

const identityFields = {
  'item-master': ['Item Code', 'Item Name'],
  'account-master': ['A/C Code', 'A/C Name'],
  'cmll-master': ['Company Code', 'Company Name'],
  'cost-centre-vehicle-master': ['Cost Centre Code', 'Cost Centre Name'],
  'location-master': ['Location Code', 'Location Name'],
  'storage-location-master': ['Storage Loc Code', 'Storage Loc. Name'],
  'route-wise-diesel-master': ['Entry No.', 'Destination'],
  'driver-master': ['Employee Code', 'Employee Name'],
  'tax-master-tds': ['TDS_Code', 'Nature_of_Payment'],
  'gst-master': ['Tax_Code', 'Tax_Description'],
  'supplier-depot-master': ['Supplier (A/C Code)', 'Depot name', 'Depot name'],
  'diesel-rate-master': ['Supplier', 'Depot', 'Depot', 'Price basis (Ex-depot / Delivered)', 'Effective from'],
  'transport-freight-master': ['Transporter', 'Transporter', 'From depot', 'To site', 'Effective from'],
  'measuring-instrument-master': ['Instrument ID', 'Type'],
  'volume-correction-table': ['Observed temperature (°C)', 'Correction factor', 'Observed density (kg/m³)'],
  'approval-limit-master': ['Entry', 'Entry', 'Applies to (all / bulk PO / retail PO)', 'Quantity or value slab', 'Effective from'],
  'tolerance-and-alert-master': ['Alert', 'Alert'],
  'reason-code-master': ['Code', 'Description'],
  'shift-master': ['Shift name', 'Shift name', 'Site'],
  'document-numbering-master': ['Entry', 'Entry', 'Financial year'],
};
export const recordMasters = masters.map(master => master.slug);

export function recordDraftScope(actor, slug) {
  return createHash('sha256')
    .update(JSON.stringify([slug, actor.id, actor.site ?? '']))
    .digest('hex');
}

export function masterDefinition(slug,values) {
  const source = masters.find(item => item.slug === slug);
  if (!source) throw new MasterRecordError('Unknown master.', 404);
  const sections=legacyTaxSections(slug,values);
  const master=sections?{...source,sections}:source;
  const labels = master.sections.flatMap(section => section.fields.map(field => field.label));
  const fields = master.sections.flatMap(section => section.fields.map(field => ({
    ...field, ...(field.label === 'Status' ? { options: ['Active', 'Inactive'] } : {}),
    ...(slug === 'storage-location-master' && field.key === 'storage-type' ? { options: field.suggestions } : {}),
    section: section.name,
    key: labels.indexOf(field.label) === labels.lastIndexOf(field.label) ? field.label : section.name + ' / ' + field.label,
    controlKey: field.key,
  })));
  return { ...master, fields, codeField: (legacyTaxIdentity(slug,values)??identityFields[slug])?.[0] };
}

export function recordIdentity(slug, values) {
  const [codeKey, nameKey, ...qualifiers] = legacyTaxIdentity(slug,values)??identityFields[slug];
  const parts = [codeKey, ...qualifiers].map(key => values[key] ?? 'All');
  const components = slug === 'volume-correction-table' ? parts.map(value => String(Number(value))) : parts;
  const code = qualifiers.length ? components.map(part => part.replace(/[|\\]/g, '\\$&')).join(' | ') : values[codeKey];
  const name = nameKey === 'Description' ? values[nameKey]?.slice(0, 1024) : values[nameKey];
  if (!code || !name || code.length > 512 || name.length > 1024) throw new MasterRecordError('Enter a valid record code and name.');
  return { code, name };
}

export function validateScalar(field, raw) {
  if (typeof raw !== 'string' && typeof raw !== 'number') throw new MasterRecordError(field.label + ' needs a text or number value.');
  const value = String(raw).trim();
  if (!value) return '';
  if (field.percentage) {
    const percentage=percentageValue(value);
    if (percentage===null) throw new MasterRecordError(field.label+' must be a percentage from 0% to 100%.');
    return percentage;
  }
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
