import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createApp } from '../../server.mjs';
import { openItemSubmissions } from '../masters/item-submissions.mjs';
import { masterDefinition } from '../masters/records-fields.mjs';
import { dataChecks, filterAndSort, missingFields, siteChecklist, siteKey } from './insights.mjs';

const sites = [{ name: 'Sasti OC', regionCode: 'WCL' }, { name: 'Majri OC', regionCode: 'WCL' }];
const storage = [
  { code: 'T1', name: 'T1-MH34AA0001', values: { 'Short Name': 'T1', Location: 'SASTI OB', 'Capacity (L)': '14000', Status: 'Active' } },
  { code: 'T1-B', name: 'T1-MH34AA0002', values: { 'Short Name': 'T1', Location: 'UNKNOWN CAMP', Status: 'Active' } },
  { code: 'OLD', name: 'Old tank', values: { 'Short Name': 'OLD', Location: 'Majri OC', 'Capacity (L)': '5000', Status: 'Inactive' } },
];

test('a record is incomplete while a required field is empty', () => {
  const definition = masterDefinition('storage-location-master');
  const missing = missingFields(definition, { 'Storage Loc Code': 'T1', 'Storage type': 'Bowser' });
  assert.ok(missing.includes('GPS location'));
  assert.ok(!missing.includes('Storage Loc Code'));
  assert.ok(!missing.some(key => key.startsWith('Calibration chart')), 'only an underground tank needs a calibration chart');
  assert.ok(missingFields(definition, { 'Storage type': 'UG tank' }).some(key => key.startsWith('Calibration chart')));
});

test('rows filter by one column or all, and sort with empty values last', () => {
  const rows = [{ site: 'Sasti OC', status: 'Active', n: '10' }, { site: 'Majri OC', status: 'Inactive', n: '9' }, { site: '', status: 'Active', n: '' }];
  const read = (row, key) => row[key], keys = ['site', 'status', 'n'];
  assert.equal(filterAndSort(rows, keys, read, { search: 'active' }).length, 3, '"inactive" contains "active" across all columns');
  assert.deepEqual(filterAndSort(rows, keys, read, { search: 'inactive', by: 'status' }).map(row => row.site), ['Majri OC']);
  assert.deepEqual(filterAndSort(rows, keys, read, { search: 'sasti', by: 'status' }), []);
  assert.deepEqual(filterAndSort(rows, keys, read, { sort: 'n' }).map(row => row.n), ['9', '10', '']);
  assert.deepEqual(filterAndSort(rows, keys, read, { sort: 'n', descending: true }).map(row => row.n), ['10', '9', '']);
  assert.equal(filterAndSort(rows, keys, read, { sort: 'password' }), rows);
});

test('the site checklist counts what each Pulse site has and names what is missing', () => {
  assert.equal(siteKey('SASTI OB'), siteKey('Sasti OC'));
  const checklist = siteChecklist({ sites, storage,
    equipment: [{ currentLocation: 'Sasti OC' }, { currentLocation: 'Sasti OC' }], drivers: [{ site: 'Sasti OC' }],
    shifts: [{ site: 'Sasti OC', status: 'Active' }, { site: 'Majri OC', status: 'Inactive' }] });
  assert.deepEqual(checklist[0], { site: 'Sasti OC', region: 'WCL', equipment: 2, drivers: 1, shifts: 1, storage: 1, missing: [] });
  assert.deepEqual(checklist[1].missing, ['equipment', 'drivers', 'active shifts', 'storage locations']);
});

test('data checks find duplicates and records at unknown sites', () => {
  const found = Object.fromEntries(dataChecks({ sites, storage,
    equipment: [{ door: 'A', reg: 'MH34 AB 1234', currentLocation: 'Sasti OC' }, { door: 'B', reg: 'MH34AB1234', currentLocation: '' }],
    drivers: [{ name: 'Ravi Kumar', empId: 'D1' }, { name: 'ravi kumar', empId: 'D2' }, { name: 'Solo', empId: 'D3' }],
    shifts: [{ shiftName: 'Night', site: 'Elsewhere' }],
    accounts: [{ code: '1', name: 'A', values: { 'Registration No.': '27X' } }, { code: '2', name: 'B', values: { 'Registration No.': '27x' } }, { code: '3', name: 'C', values: {} }],
  }).map(check => [check.title, check]));
  assert.equal(found['Storage locations that share a short name'].count, 1);
  assert.deepEqual(found['Storage locations at a site that is not in the Site Master'].items, ['T1-B · T1-MH34AA0002 — UNKNOWN CAMP']);
  assert.equal(found['Storage locations with no capacity'].count, 1);
  assert.equal(found['Equipment with no site, or a site that is not in the Site Master'].count, 1);
  assert.equal(found['Equipment that shares a registration number'].count, 1);
  assert.deepEqual(found['Drivers listed under more than one employee code'].items, ['Ravi Kumar: D1, D2']);
  assert.equal(found['Shifts for a site that is not in the Site Master'].count, 1);
  assert.equal(found['Accounts that share a GST registration number'].count, 1);
});

test('Master Data shows the overview, site checklist, data checks, counts, column search and sorting', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'diesel-insights-'));
  const itemSubmissions = await openItemSubmissions(directory);
  const feed = { erpDrivers: true, masters: {
    region: [{ name: 'Western Coalfields Limited', code: 'WCL' }],
    site: [{ name: 'Sasti OC', regionCode: 'WCL' }, { name: 'Majri OC', regionCode: 'WCL' }],
    equipment: [{ door: 'T-101', reg: 'MH34AB1234', currentLocation: 'Sasti OC', make: 'Volvo' }, { door: 'T-202', reg: 'MH34CD5678', currentLocation: 'Majri OC', make: 'Tata' },
      { door: 'T-303', reg: 'MH34AB1234', currentLocation: 'Nowhere', make: 'Volvo' }],
    employee: [], driver: [{ empId: 'D1', name: 'Ravi Kumar', site: 'Sasti OC' }],
    shift: [{ site: 'Sasti OC', shiftName: 'First', status: 'Active' }],
  } };
  const app = createApp({ itemSubmissions,
    env: { WEBSITE_SITE_NAME: 'diesel-test', DIESEL_PUBLIC_ORIGIN: 'https://diesel.test', DIESEL_SSO_CLIENT_SECRET: 's'.repeat(43) },
    fetcher: async (url, options) => JSON.parse(options.body).grant !== 'u'.repeat(43) ? new Response(null, { status: 401 })
      : Response.json(url.pathname.endsWith('/masters') ? feed : { profile: { login: 'anyone', name: 'Any User' } }) });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); });
  const get = (path, grant = 'u'.repeat(43), accept = 'text/html') => fetch('http://127.0.0.1:' + server.address().port + path,
    { redirect: 'manual', headers: { cookie: '__Host-diesel_session=' + grant, accept } });
  const page = async path => (await get(path)).text();

  assert.equal((await get('/master-insights', 'x'.repeat(43))).status, 303);
  assert.equal((await get('/api/master-insights/counts', 'x'.repeat(43), 'application/json')).status, 401);

  const counts = await (await get('/api/master-insights/counts', undefined, 'application/json')).json();
  assert.deepEqual(counts.pulse, { site: 2, region: 1, equipment: 3, employee: 0, driver: 1, shift: 1 });
  assert.equal(counts.masters['storage-location-master'], 71);
  assert.equal(counts.masters['account-master'], 165);
  assert.equal(counts.masters['gst-master'], 0);

  const overview = await page('/master-insights');
  assert.match(overview, /<a href="\/pulse-masters\?master=equipment">Equipment Master<\/a><\/th><td data-label="Records">3<\/td>/);
  assert.match(overview, /Storage Location Master<\/a><\/th><td data-label="Records">71<\/td><td data-label="Incomplete"><span class="record-incomplete">71 missing required fields/);
  assert.match(overview, /IST/);

  const checklist = await page('/master-insights?view=sites');
  assert.match(checklist, /Sasti OC<\/th><td data-label="Region">WCL<\/td><td data-label="Equipment">1<\/td><td data-label="Drivers">1<\/td><td data-label="Active shifts">1<\/td><td data-label="Storage locations">8<\/td><td data-label="Still missing">Ready/);
  assert.match(checklist, /Majri OC<\/th>[\s\S]*?drivers, active shifts/);

  const checks = await page('/master-insights?view=checks');
  assert.match(checks, /Equipment that shares a registration number <span class="record-incomplete">1<\/span>/);
  assert.match(checks, /T-303 — Nowhere/);
  assert.match(checks, /Storage locations that share a short name <span class="record-incomplete">3<\/span>/);

  const sidebar = await page('/master-data');
  assert.match(sidebar, /<h2>From Pulse<\/h2>/, 'the Master Data home shows the overview instead of an empty page');
  assert.match(sidebar, /<a href="\/pulse-masters\?master=equipment">Equipment Master<\/a><\/th><td data-label="Records">3<\/td>/);
  assert.match(sidebar, /Storage Location Master<\/a><\/th><td data-label="Records">71<\/td>/);
  assert.match(sidebar, /<a href="\/master-insights\?view=sites">Site checklist<\/a>/);
  assert.doesNotMatch(await page('/master-data?master=gst-master'), /From Pulse/);
  assert.match(sidebar, /data-counts="\/api\/master-insights\/counts"/);
  assert.match(sidebar, /<a href="\/master-insights">Overview and checks<\/a>/);

  const byMake = await page('/pulse-masters?master=equipment&q=volvo&by=make&sort=door&dir=desc');
  assert.ok(byMake.indexOf('T-303') > 0 && byMake.indexOf('T-303') < byMake.indexOf('T-101'), 'Z → A by door');
  assert.doesNotMatch(byMake, /T-202/);
  assert.match(byMake, /<option value="make" selected>Make<\/option>/);
  assert.doesNotMatch(await page('/pulse-masters?master=equipment&q=volvo&by=door'), /T-101/);
  assert.match(byMake, /<td data-label="Make">Volvo<\/td>/);

  const bowsers = await page('/master-data?master=storage-location-master&q=bowser&by=Storage+type&sort=Capacity+%28L%29&dir=desc');
  assert.match(bowsers, /Incomplete · \d+/);
  assert.doesNotMatch(bowsers, /<td data-label="Storage type">Tank truck/);
  const capacities = [...bowsers.matchAll(/<td data-label="Capacity \(L\)">(\d+)<\/td>/g)].map(([, litres]) => Number(litres));
  assert.equal(capacities.length, 13);
  assert.deepEqual(capacities, [...capacities].sort((a, b) => b - a));
  assert.match(await page('/master-data?master=storage-location-master&offset=50&sort=Storage+Loc+Code'), /offset=0/);
});
