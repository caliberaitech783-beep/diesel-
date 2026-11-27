import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createApp } from '../../server.mjs';
import { openItemSubmissions } from '../masters/item-submissions.mjs';
import { masterDefinition } from '../masters/records-fields.mjs';
import { dataChecks, equipmentBySite, filterAndSort, missingFields, siteChecklist, siteKey } from './insights.mjs';

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

test('equipment is counted by site and category, including locations the Location Master lacks', () => {
  const summary = equipmentBySite({ sites, storage, drivers: [{ site: 'Sasti OC' }], shifts: [{ site: 'Sasti OC', status: 'Active' }], equipment: [
    { currentLocation: 'Sasti OC', category: 'Tipper' }, { currentLocation: 'sasti ob', category: 'Tipper' }, { currentLocation: 'Sasti OC', category: 'Excavator' },
    { currentLocation: 'Workshop', category: 'Tipper' }, { currentLocation: '', category: '' }, { currentLocation: ' - ', category: 'Tipper' }] });
  assert.deepEqual(summary.categories, ['Tipper', 'Excavator']);
  assert.equal(summary.unplaced, 2, 'a blank or dash location gets no row');
  assert.deepEqual(summary.rows.map(row => [row.site, row.total, row.listed]), [['Sasti OC', 3, true], ['Workshop', 1, false], ['Majri OC', 0, true]]);
  assert.deepEqual(summary.rows[0], { site: 'Sasti OC', listed: true, counts: { Tipper: 2, Excavator: 1 }, total: 3, drivers: 1, shifts: 1, storage: 1 });
  assert.deepEqual(summary.total, { counts: { Tipper: 3, Excavator: 1 }, total: 4, drivers: 1, shifts: 1, storage: 1 });
  const kinds = equipmentBySite({ equipment: [{ currentLocation: 'A', category: 'VEHICLE' }, { currentLocation: 'A', category: 'Other vehicles', group: 'LMV' },
    { currentLocation: 'A', category: 'EQUIPMENT', equipmentName: 'DG SET 125 KVA' }, { currentLocation: 'A', category: 'EQUIPMENT', group: 'D.G. Set' },
    { currentLocation: 'A', category: 'EQUIPMENT', equipmentName: 'DGX loader' }] });
  assert.deepEqual(kinds.rows[0].counts, { VEHICLE: 1, LMV: 1, 'DG set': 2, EQUIPMENT: 1 });
  const small = equipmentBySite({ equipment: [...Array.from({ length: 20 }, (_, index) => ({ currentLocation: 'A', category: 'C' + (index % 5) })), { currentLocation: 'A', group: 'LMV' }] }, 3);
  assert.deepEqual(small.categories, ['C0', 'C1', 'LMV', 'Other'], 'a small LMV count still gets its own column');
  const many = equipmentBySite({ equipment: Array.from({ length: 20 }, (_, index) => ({ currentLocation: 'A', category: 'C' + index })) }, 4);
  assert.deepEqual(many.categories, ['C0', 'C1', 'C10', 'Other']);
  assert.equal(many.rows[0].counts.Other, 17);
});

test('data checks find duplicates and records at unknown sites', () => {
  const found = Object.fromEntries(dataChecks({ sites, storage,
    equipment: [{ door: 'A', reg: 'MH34 AB 1234', currentLocation: 'Sasti OC' }, { door: 'B', reg: 'MH34AB1234', currentLocation: '' }],
    drivers: [{ name: 'Ravi Kumar', empId: 'D1' }, { name: 'ravi kumar', empId: 'D2' }, { name: 'Solo', empId: 'D3' }],
    shifts: [{ shiftName: 'Night', site: 'Elsewhere' }],
    accounts: [{ code: '1', name: 'A', values: { 'Registration No.': '27X' } }, { code: '2', name: 'B', values: { 'Registration No.': '27x' } }, { code: '3', name: 'C', values: {} }],
  }).map(check => [check.title, check]));
  assert.equal(found['Storage locations that share a short name'].count, 1);
  assert.deepEqual(found['Storage locations at a site that is not in the Location Master'].items, ['T1-B · T1-MH34AA0002 — UNKNOWN CAMP']);
  assert.equal(found['Storage locations with no capacity'].count, 1);
  assert.equal(found['Equipment with no site, or a site that is not in the Location Master'].count, 1);
  assert.equal(found['Equipment that shares a registration number'].count, 1);
  assert.deepEqual(found['Drivers listed under more than one employee code'].items, ['Ravi Kumar: D1, D2']);
  assert.equal(found['Shifts for a site that is not in the Location Master'].count, 1);
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
  assert.deepEqual(counts.pulse, { site: 5, region: 1, equipment: 3, employee: 0, driver: 1, shift: 1, company: 0 });
  assert.equal(counts.masters['storage-location-master'], 71);
  assert.equal(counts.masters['account-master'], 165);
  assert.equal(counts.masters['gst-master'], 4);
  assert.equal(counts.masters['tax-master-tds'], 3);

  // "Pulse and equipment" under Data review holds the Pulse table, when it was fetched, and the equipment at each site.
  const overview = await page('/master-insights?view=overview');
  assert.match(overview, /<a href="\/pulse-masters\?master=equipment">Equipment Master<\/a><\/th><td data-label="Records">3<\/td>/);
  assert.match(overview, /<p class="record-meta pulse-fetched">Pulse data last fetched [^<]* IST\.<\/p>/);
  assert.match(overview, /<h2>Equipment by site<\/h2>/);
  assert.match(overview, /master=equipment&amp;by=currentLocation&amp;q=Sasti\+OC">Sasti OC<\/a><\/th><td data-label="Uncategorised">1<\/td><td data-label="Total equipment"><strong>1<\/strong><\/td><td data-label="Drivers">1<\/td><td data-label="Active shifts">1<\/td><td data-label="Storage locations">8<\/td>/);
  const checklist = await page('/master-insights?view=sites');
  assert.match(checklist, /Sasti OC<\/th><td data-label="Region">WCL<\/td><td data-label="Equipment">1<\/td><td data-label="Drivers">1<\/td><td data-label="Active shifts">1<\/td><td data-label="Storage locations">8<\/td><td data-label="Still missing">Ready/);
  assert.match(checklist, /Majri OC<\/th>[\s\S]*?drivers, active shifts/);

  const checks = await page('/master-insights?view=checks');
  // Each check that found something is a card: its count, what it means, where to correct it, and the records.
  assert.match(checks, /<span class="check-count" title="1 to correct">1<\/span>\s*<div><h2>Equipment that shares a registration number<\/h2><p>One vehicle should appear once in the Equipment Master\.<\/p><\/div><a class="check-fix" href="\/pulse-masters\?master=equipment">Open Equipment Master →<\/a>/);
  assert.match(checks, /<li><b>T-303<\/b><span>Nowhere<\/span><\/li>/);
  assert.match(checks, /<span class="check-count" title="3 to correct">3<\/span>\s*<div><h2>Storage locations that share a short name<\/h2>/);
  assert.match(checks, /<a class="check-fix" href="\/master-data\?master=storage-location-master">Open Storage Location Master →<\/a>/);
  assert.match(checks, /<div class="check-summary"><div class="check-tile "><strong>8<\/strong><span>Checks run<\/span><\/div>/);
  assert.ok(checks.includes('id="check-filter"') && !checks.includes(' style='));

  assert.match(overview, /Nowhere<\/a> <small class="record-incomplete"[^>]*>Not in Location Master/);
  assert.match(overview, /All sites<\/th><td data-label="Uncategorised">3<\/td>/);
  // Data review opens on the checks, with tabs to the other two views.
  assert.match(await page('/master-insights'), /<h1 id="workspace-title">Data checks<\/h1>/);
  assert.match(checks, /<a href="\/master-insights\?view=checks" aria-current="page">Data checks<\/a><a href="\/master-insights\?view=sites">Site checklist<\/a><a href="\/master-insights\?view=overview">Pulse and equipment<\/a>/);

  // The Master Data home is only the masters, as cards.
  const sidebar = await page('/master-data');
  assert.doesNotMatch(sidebar, /<h2>From Pulse<\/h2>|<h2>Equipment by site<\/h2>|<h2>Diesel masters<\/h2>|insight-views/);
  assert.match(sidebar, /<a class="master-card" href="\/master-data\?master=storage-location-master"[^>]*>[\s\S]*?<small>71 records<\/small>\s*<em class="record-incomplete">71 missing required fields<\/em>/);
  assert.doesNotMatch(await page('/master-data?master=gst-master'), /From Pulse/);
  // The menu is short now: the masters are cards on the page, and the checks have their own link.
  assert.match(sidebar, /<a href="\/master-insights\?view=checks">.*Data review<\/a>/);
  assert.doesNotMatch(sidebar, /master-data-list|Overview and checks/);
  for (const name of ['Driver Master', 'Shift Master']) {
    assert.match(sidebar, new RegExp('<a class="master-card" href="/pulse-masters\\?master=[a-z-]+"[^>]*>[\\s\\S]*?<b>' + name + '</b><small>[^<]*<i class="from-pulse">Pulse</i>'));
    assert.doesNotMatch(sidebar, new RegExp('master-data\\?master=[a-z-]+"[^>]*>[\\s\\S]{0,200}?<b>' + name + '</b>'), name + ' is listed once in Master Data');
  }
  assert.match(sidebar, /<a class="master-card" href="\/pulse-masters\?master=site"[^>]*>[\s\S]*?<b>Location Master<\/b>/);
  assert.doesNotMatch(sidebar, /href="[^"]*[?&](?:amp;)?master=location-master"|>Site Master/);

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
