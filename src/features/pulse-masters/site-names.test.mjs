import assert from 'node:assert/strict';
import test from 'node:test';
import { companyRecords } from '../company-records/company-records.mjs';
import { dataChecks, siteChecklist } from '../master-insights/insights.mjs';
import { pulseMaster } from './pulse-master-catalog.mjs';
import { forSite } from './pulse-master-rules.mjs';
import { canonicalSite } from './site-names.mjs';

const pulseSites = ['Sasti OC', 'Majri OC', 'Dhoptala OC (2nd)', 'Gauri Pauni OC (2nd)', 'Lalpeth OC', 'Jayant OC', 'Dudhichua OC', 'Dudhichua East OC']
  .map(name => ({ name }));

test('every spelling Pulse recognises is the same site', () => {
  const same = (first, second) => assert.equal(canonicalSite(first), canonicalSite(second), first + ' = ' + second);
  same('GOURI POUNI OB (2ND)', 'Gauri Pauni OC (2nd)');
  same('Gouri Pouni', 'Gauri Pauni OC (2nd)');
  same('DHOPTALA OB 2ND', 'Dhoptala OC (2nd)');
  same('Dudhichua West OB', 'Dudhichua OC');
  same('dudhichua east', 'Dudhichua East OC');
  same('SASTI II', 'Sasti OC');
  same('Jayant', 'JAYANT OB');
  assert.notEqual(canonicalSite('Dudhichua OC'), canonicalSite('Dudhichua East OC'));
  assert.notEqual(canonicalSite('Dudhichua'), canonicalSite('Dudhichua OC'), 'a bare Dudhichua could be either pit');
  assert.equal(canonicalSite('  '), '');
  assert.equal(canonicalSite(null), '');
});

test('the storage sheet lands on its Pulse sites, and only real non-sites stay flagged', () => {
  const storage = companyRecords('storage-location-master');
  const counts = Object.fromEntries(siteChecklist({ sites: pulseSites, storage }).map(row => [row.site, row.storage]));
  assert.deepEqual(counts, { 'Sasti OC': 8, 'Majri OC': 9, 'Dhoptala OC (2nd)': 4, 'Gauri Pauni OC (2nd)': 7, 'Lalpeth OC': 0,
    'Jayant OC': 17, 'Dudhichua OC': 8, 'Dudhichua East OC': 5 });
  const flagged = dataChecks({ sites: pulseSites, storage }).find(check => check.title.startsWith('Storage locations at a site'));
  assert.deepEqual([...new Set(flagged.items.map(item => item.split(' — ')[1]))].sort(), ['CMPL CHANDRAPUR', 'DUDHICHUA', 'GHUGUS SIDING', 'SINGURLI']);
});

test('a site role sees its records under any spelling of its site', () => {
  const equipment = pulseMaster('equipment');
  const rows = [{ door: 'A', currentLocation: 'Gauri Pauni OC (2nd)' }, { door: 'B', currentLocation: 'GOURI POUNI OB (2ND)' }, { door: 'C', currentLocation: 'Sasti OC' }];
  assert.deepEqual(forSite(equipment, rows, ['Gouri Pouni']).map(row => row.door), ['A', 'B']);
  assert.deepEqual(forSite(equipment, rows, ['Sasti', undefined]).map(row => row.door), ['C']);
  assert.equal(forSite(equipment, rows, []).length, 3);
});
