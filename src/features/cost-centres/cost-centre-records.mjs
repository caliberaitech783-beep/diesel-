import { createHash } from 'node:crypto';
import { MasterRecordError } from '../masters/records-fields.mjs';

export const costCentreSlug = 'cost-centre-vehicle-master';
const text = value => String(value ?? '').trim();
const normalize = value => text(value).normalize('NFKC').toLowerCase();
const identifier = value => normalize(value).replace(/[^\p{L}\p{N}]/gu, '');
const usable = value => /[\p{L}\p{N}]/u.test(text(value)) && !/^(?:n\/?a|null|undefined)$/i.test(text(value));

// Cost Centre Master = vehicles + equipment, including non-road equipment without a registration.
// This is a read-through projection, not an approval of Diesel fuel or meter settings.
export function costCentreRecords({ records, syncedAt }) {
  const seen = new Set();
  return records.flatMap(asset => {
    const code = [asset.door, asset.reg, asset.asset].find(usable);
    if (!code || seen.has(normalize(code))) return [];
    seen.add(normalize(code));
    const makeModel = [asset.make, asset.model].filter(usable).join(' ');
    const name = [asset.equipmentName, makeModel, code].find(usable);
    return [{
      id: createHash('sha256').update('pulse-cost-centre\n' + normalize(code)).digest('hex'),
      master: costCentreSlug, code: text(code), name: text(name), site: text(asset.currentLocation),
      status: 'reference', revision: 1, updatedAt: syncedAt ?? '', editedBy: 'Pulse Equipment Master',
      pulseSource: true, sourceName: 'Pulse Equipment Master · Vehicles and equipment', canEdit: false,
      values: {
        'Cost Centre Code': text(code), 'Cost Centre Name': text(name),
        'Cost Centre Type': text(asset.category || asset.group),
        'Fleet No.': text(asset.door), 'Registration No.': text(asset.reg),
        'Vehicle type': text(asset.group || asset.equipmentName || asset.category),
        'Make and model': makeModel, 'Project (location)': text(asset.currentLocation),
        'Chassis No.': text(asset.chassisNo), 'Engine No.': text(asset.engineNo), Status: text(asset.status),
      },
    }];
  });
}

function identities(record) {
  return [
    ['code', record.code], ['code', record.values?.['Cost Centre Code']],
    ['fleet', record.values?.['Fleet No.']], ['registration', record.values?.['Registration No.']],
  ].filter(([, value]) => usable(value)).map(([kind, value]) => kind + ':' + identifier(value));
}

export function mergeCostCentres(saved, sources, { search = '', status = '', offset = 0, limit } = {}) {
  if (typeof search !== 'string' || search.length > 256 || !Number.isSafeInteger(offset) || offset < 0
    || (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1))
    || !['', 'reference', 'approved', 'pending', 'returned', 'pending_deactivation', 'pending_deletion', 'inactive'].includes(status)) {
    throw new MasterRecordError('Choose a valid cost centre search or page.', 400);
  }
  const existing = new Set(saved.filter(record => record.master === costCentreSlug && record.status !== 'deleted').flatMap(identities));
  const registrations = new Map();
  for (const source of sources) for (const key of identities(source).filter(key => key.startsWith('registration:'))) {
    registrations.set(key, (registrations.get(key) ?? 0) + 1);
  }
  const seen = new Set();
  const combined = [...saved.filter(record => record.status !== 'deleted')];
  for (const source of sources) {
    const keys = identities(source);
    const stableKeys = keys.filter(key => !key.startsWith('registration:'));
    // A repeated registration in Pulse must not hide distinct fleet assets.
    if (stableKeys.some(key => existing.has(key) || seen.has(key))
      || keys.some(key => registrations.get(key) === 1 && existing.has(key))) continue;
    stableKeys.forEach(key => seen.add(key));
    combined.push(source);
  }
  const query = normalize(search);
  return combined.filter(record => (!status || record.status === status)
    && [record.code, record.name, ...(record.master === costCentreSlug ? Object.values(record.values ?? {}) : [])]
      .some(value => normalize(value).includes(query)))
    .sort((a, b) => a.master.localeCompare(b.master) || a.code.localeCompare(b.code, 'en', { numeric: true }) || a.id.localeCompare(b.id))
    .slice(offset, limit === undefined ? undefined : offset + limit);
}
