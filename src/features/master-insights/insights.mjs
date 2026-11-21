// Read-only views over the masters: what each record still lacks, what each site has, and what does not agree.
const text = value => String(value ?? '').trim();
const lower = value => text(value).normalize('NFKC').toLowerCase();
// "SASTI OB", "Sasti OC" and "sasti-oc" are one site. Pulse shows overburden sites as "OC".
export const siteKey = value => text(value).toUpperCase().replace(/\bOB\b/g, 'OC').replace(/[^\p{L}\p{N}]/gu, '');

// Required fields of a master form that a record leaves empty.
export function missingFields(definition, values = {}) {
  return definition.fields.filter(field => field.required && !field.readOnly
    && !(field.controlKey === 'calibration-chart' && values['Storage type'] !== 'UG tank')
    && (values[field.key] === undefined || values[field.key] === null || values[field.key] === ''))
    .map(field => field.key);
}

// Narrows to rows whose chosen column (or any column) contains every search word, then orders them.
export function filterAndSort(rows, columns, read, { search = '', by = '', sort = '', descending = false } = {}) {
  const words = lower(search).split(/\s+/).filter(Boolean);
  const keys = columns.includes(by) ? [by] : columns;
  let found = words.length ? rows.filter(row => {
    const line = keys.map(key => lower(read(row, key))).join(' ');
    return words.every(word => line.includes(word));
  }) : rows;
  if (columns.includes(sort)) {
    const order = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
    found = [...found].sort((first, second) => {
      const a = text(read(first, sort)), b = text(read(second, sort));
      // Empty values go last in either direction.
      if (!a || !b) return a ? -1 : b ? 1 : 0;
      return descending ? order.compare(b, a) : order.compare(a, b);
    });
  }
  return found;
}

const tally = (rows, read) => {
  const counts = new Map();
  for (const row of rows) {
    const key = siteKey(read(row));
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
};

// One row per Pulse site: what Diesel already holds for it and what it still lacks.
export function siteChecklist({ sites = [], equipment = [], drivers = [], shifts = [], storage = [] }) {
  const counts = {
    equipment: tally(equipment, row => row.currentLocation), drivers: tally(drivers, row => row.site),
    shifts: tally(shifts.filter(row => lower(row.status) !== 'inactive'), row => row.site),
    storage: tally(storage.filter(row => lower(row.values?.Status) !== 'inactive'), row => row.values?.Location),
  };
  return sites.map(site => {
    const key = siteKey(site.name);
    const row = { site: site.name, region: site.regionCode || site.region,
      equipment: counts.equipment.get(key) ?? 0, drivers: counts.drivers.get(key) ?? 0,
      shifts: counts.shifts.get(key) ?? 0, storage: counts.storage.get(key) ?? 0 };
    const missing = [['equipment', 'equipment'], ['drivers', 'drivers'], ['shifts', 'active shifts'], ['storage', 'storage locations']]
      .filter(([name]) => !row[name]).map(([, label]) => label);
    return { ...row, missing };
  });
}

const groups = (rows, read) => {
  const found = new Map();
  for (const row of rows) {
    const key = lower(read(row));
    if (key) found.set(key, [...(found.get(key) ?? []), row]);
  }
  return [...found.values()];
};

// Duplicates and records that point at a site Pulse does not list.
export function dataChecks({ sites = [], equipment = [], drivers = [], shifts = [], storage = [], accounts = [] }) {
  const known = new Set(sites.map(site => siteKey(site.name)));
  const unknownSite = value => text(value) && !known.has(siteKey(value));
  const repeated = (rows, read, minimum = 2) => groups(rows, read).filter(group => group.length >= minimum);
  const checks = [
    { title: 'Storage locations that share a short name', help: 'Two tanks or bowsers under one short name are easy to confuse at issue time.',
      items: repeated(storage, row => row.values?.['Short Name']).map(group =>
        group[0].values['Short Name'] + ': ' + group.map(row => row.name + ' (' + text(row.values.Location) + ')').join(', ')) },
    { title: 'Storage locations at a site that is not in the Site Master', help: 'Add the site in Pulse, or correct the Location on the storage record.',
      items: storage.filter(row => unknownSite(row.values?.Location)).map(row => row.code + ' · ' + row.name + ' — ' + text(row.values.Location)) },
    { title: 'Storage locations with no capacity', help: 'Stock limits cannot be checked without a capacity.',
      items: storage.filter(row => !(Number(row.values?.['Capacity (L)']) > 0)).map(row => row.code + ' · ' + row.name) },
    { title: 'Equipment with no site, or a site that is not in the Site Master', help: 'Correct the current location in Pulse.',
      items: equipment.filter(row => !text(row.currentLocation) || unknownSite(row.currentLocation))
        .map(row => (row.door || row.reg || row.equipmentName) + ' — ' + (text(row.currentLocation) || 'no location')) },
    { title: 'Equipment that shares a registration number', help: 'One vehicle should appear once in the Equipment Master.',
      items: repeated(equipment, row => text(row.reg).replace(/[^\p{L}\p{N}]/gu, '')).map(group =>
        group[0].reg + ': ' + group.map(row => (row.door || row.equipmentName) + ' (' + (text(row.currentLocation) || 'no location') + ')').join(', ')) },
    { title: 'Drivers listed under more than one employee code', help: 'The same name with two ERP codes is usually one person entered twice.',
      items: repeated(drivers, row => row.name).filter(group => new Set(group.map(row => lower(row.empId))).size > 1)
        .map(group => group[0].name + ': ' + group.map(row => row.empId + (row.site ? ' (' + row.site + ')' : '')).join(', ')) },
    { title: 'Shifts for a site that is not in the Site Master', help: 'Correct the site on the shift in Pulse.',
      items: shifts.filter(row => unknownSite(row.site)).map(row => row.shiftName + ' — ' + row.site) },
    { title: 'Accounts that share a GST registration number', help: 'One supplier under two account codes splits its purchases and payments.',
      items: repeated(accounts, row => row.values?.['Registration No.']).map(group =>
        group[0].values['Registration No.'] + ': ' + group.map(row => row.code + ' · ' + row.name).join(', ')) },
  ];
  return checks.map(check => ({ ...check, count: check.items.length }));
}

// Equipment counted by site and equipment category, with each site's drivers, shifts and storage alongside.
// Sites come from the Site Master first; a location equipment uses that the Site Master lacks still gets a row.
export function equipmentBySite({ sites = [], equipment = [], drivers = [], shifts = [], storage = [] }, maximumCategories = 12) {
  // LMVs and DG sets are counted under their own headings, whatever category the ERP files them in.
  const dgWord = /(^|[^a-z])(dg|d\.g\.?|genset|gen set|generator)([^a-z]|$)/i;
  const label = row => [row.group, row.category].some(value => lower(value) === 'lmv') ? 'LMV'
    : [row.group, row.category, row.itemName, row.equipmentName].some(value => dgWord.test(text(value))) ? 'DG set'
    : text(row.category) || 'Uncategorised';
  const totals = new Map();
  const noSite = row => { const key = siteKey(row.currentLocation); return !key || ['NA', 'NIL', 'NONE', 'NULL'].includes(key); };
  const placed = equipment.filter(row => !noSite(row));
  for (const row of placed) totals.set(label(row), (totals.get(label(row)) ?? 0) + 1);
  const ranked = [...totals].sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0])).map(([name]) => name);
  // LMV and DG set keep their own column even when they are small.
  const kept = ranked.length > maximumCategories
    ? [...new Set([...ranked.slice(0, maximumCategories - 1), ...ranked.filter(name => ['LMV', 'DG set'].includes(name))])] : ranked;
  const categories = kept.length < ranked.length ? [...ranked.filter(name => kept.includes(name)), 'Other'] : ranked;
  const column = row => categories.includes(label(row)) ? label(row) : 'Other';
  const rows = new Map(sites.map(site => [siteKey(site.name), { site: site.name, listed: true, counts: {}, total: 0 }]));
  // A blank or placeholder location ("-", "NA") is not a site: it gets no row and is reported as unplaced.
  const unplaced = equipment.length - placed.length;
  for (const row of placed) {
    const name = text(row.currentLocation);
    const key = siteKey(name);
    if (!rows.has(key)) rows.set(key, { site: name, listed: false, counts: {}, total: 0 });
    const entry = rows.get(key);
    entry.counts[column(row)] = (entry.counts[column(row)] ?? 0) + 1;
    entry.total += 1;
  }
  const others = Object.fromEntries(siteChecklist({ sites: [...rows.values()].map(row => ({ name: row.site })), drivers, shifts, storage })
    .map(row => [siteKey(row.site), row]));
  const list = [...rows.entries()].map(([key, row]) => ({ ...row, drivers: others[key]?.drivers ?? 0, shifts: others[key]?.shifts ?? 0, storage: others[key]?.storage ?? 0 }))
    .sort((first, second) => second.total - first.total || first.site.localeCompare(second.site));
  const sum = read => list.reduce((total, row) => total + read(row), 0);
  return { categories, rows: list, unplaced, total: { counts: Object.fromEntries(categories.map(name => [name, sum(row => row.counts[name] ?? 0)])),
    total: sum(row => row.total), drivers: sum(row => row.drivers), shifts: sum(row => row.shifts), storage: sum(row => row.storage) } };
}
