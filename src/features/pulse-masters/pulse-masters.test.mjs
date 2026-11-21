import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createApp } from '../../server.mjs';
import { openHostedMasterDatabase } from '../masters/hosted-master-storage.mjs';
import { openItemSubmissions } from '../masters/item-submissions.mjs';
import { forSite, readPulseMasters } from './pulse-master-rules.mjs';
import { pulseMaster } from './pulse-master-catalog.mjs';

const origin = 'https://diesel.test';
let erpDrivers = true;
const feed = () => ({ masters: {
  region: [{ id: '1', name: 'Western Coalfields Limited', code: 'WCL', state: 'MH / MP', sites: 'Sasti OC | Majri OC' }],
  site: [{ name: 'Sasti OC', region: 'Western Coalfields Limited', regionCode: 'WCL', state: 'MH / MP' },
    { name: 'Majri OC', region: 'Western Coalfields Limited', regionCode: 'WCL', state: 'MH / MP' }],
  equipment: [{ door: 'T-101', reg: 'MH34AB1234', currentLocation: 'Sasti OC', make: 'Volvo', model: 'FMX 500' },
    { door: 'T-202', reg: 'MH34CD5678', currentLocation: 'Majri OC', make: 'Volvo', model: 'FMX 460' }],
  employee: [{ empId: 'E001', name: 'Ravi Kumar', site: 'Sasti OC', designation: 'TIPPER DRIVER', phone: '9000000001', passwordHash: 'never' },
    { empId: 'E002', name: 'Anita Rao', site: 'Majri OC', designation: 'Store Keeper' }],
  driver: [{ empId: 'D200', name: 'Mahesh Patel', site: 'Majri OC', vehicle: 'EX-7', lastDate: '2026-11-20', source: 'Equipment logbook' },
    { empId: 'E001', name: 'Ravi Kumar', site: 'Sasti OC', vehicle: 'T-101', lastDate: '2026-11-18', source: 'Vehicle logbook', designation: 'TIPPER DRIVER', phone: '=9000000001' }],
}, erpDrivers });

test('a Pulse master copy keeps only listed columns and rejects an incomplete reply', () => {
  const copy = readPulseMasters(feed());
  assert.equal(copy.employee[0].passwordHash, undefined);
  assert.equal(copy.employee[0].phone, '9000000001');
  assert.throws(() => readPulseMasters({ masters: { region: [] } }));
  assert.throws(() => readPulseMasters({ profile: { login: 'maker' } }));
  const equipment = pulseMaster('equipment');
  assert.deepEqual(forSite(equipment, copy.equipment, ['Sasti']).map(row => row.door), ['T-101']);
  assert.deepEqual(forSite(equipment, copy.equipment, ['Majri OC', undefined]).map(row => row.door), ['T-202']);
  assert.equal(forSite(equipment, copy.equipment, []).length, 2);
  assert.equal(forSite(pulseMaster('region'), copy.region, ['Sasti']).length, 1);
});

test('Master Data lists the Pulse Site, Region, Equipment, Employee and Driver masters read-only', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'diesel-pulse-masters-'));
  const db = openHostedMasterDatabase(join(dir, 'masters.sqlite'));
  const itemSubmissions = await openItemSubmissions(join(dir, 'previous'));
  const profiles = {
    a: { login: 'admin', name: 'Admin' },
    v: { login: 'viewer', dieselMasterAccess: [{ site: 'Sasti', role: 'viewer', projectName: 'Sasti OC', client: 'WCL' }] },
    x: { login: 'excluded' },
  };
  let pulseUp = true, fetched = 0, clock = Date.parse('2026-11-19T10:00:00Z');
  const currentFeed = feed();
  const app = createApp({
    env: { WEBSITE_SITE_NAME: 'diesel', DIESEL_PUBLIC_ORIGIN: origin, DIESEL_SSO_CLIENT_SECRET: 's'.repeat(43), DIESEL_ALLOWED_PULSE_LOGINS: 'admin', DIESEL_PULSE_ACCESS: 'listed' },
    itemSubmissions, sharedMasterDb: db, pulseMasterClock: () => clock,
    fetcher: async (url, options) => {
      const { grant } = JSON.parse(options.body);
      if (url.pathname.endsWith('/masters')) {
        assert.equal(options.headers.Authorization, 'Bearer ' + 's'.repeat(43));
        fetched++;
        return pulseUp ? Response.json(currentFeed) : new Response('', { status: 503 });
      }
      const profile = profiles[grant[0]];
      return profile ? Response.json({ profile }) : new Response('', { status: 401 });
    },
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); await rm(dir, { recursive: true, force: true }); });
  const address = 'http://127.0.0.1:' + server.address().port;
  const req = (path, who, options = {}) => fetch(address + path, { redirect: 'manual', ...options,
    headers: { cookie: who ? '__Host-diesel_session=' + who.repeat(43) : '', ...options.headers } });
  const page = async (path, who) => (await req(path, who)).text();

  assert.equal((await req('/pulse-masters?master=site')).status, 303);
  assert.equal((await req('/pulse-masters?master=site', 'x')).status, 303);
  assert.equal((await req('/pulse-masters?master=item-master', 'a')).status, 400);

  const sidebar = await page('/master-data', 'a');
  const order = ['Site Master · Pulse', 'Region Master · Pulse', 'Equipment Master · Pulse', 'Employee Master · Pulse', 'Driver Master · Pulse', 'Item Master']
    .map(name => sidebar.indexOf('>' + name + '<'));
  assert.ok(order.every((position, index) => position > 0 && (!index || position > order[index - 1])), 'Pulse masters lead Master Data');

  const equipment = await page('/pulse-masters?master=equipment', 'a');
  assert.match(equipment, /T-101/);
  assert.match(equipment, /T-202/);
  assert.match(equipment, /data-live-records/);
  assert.match(equipment, /live-records.js/);
  assert.doesNotMatch(equipment, /id="masters-sidebar"|navigation.js/);
  assert.match(equipment, /<h1[^>]*>Equipment Master<\/h1>\s*<form class="master-data-search"/);
  assert.equal([...equipment.matchAll(/type="search"/g)].length, 1);
  assert.doesNotMatch(equipment, /<label>Search|<button>Search<\/button>/);
  assert.match(equipment, /data-export-source="\/pulse-masters\/records\?master=equipment"/);
  assert.match(equipment, /<summary>Download<\/summary>/);
  for (const format of ['CSV', 'Excel', 'PDF']) assert.match(equipment, new RegExp('aria-label="Download ' + format + '"'));
  assert.doesNotMatch(equipment, /data-live-status|>Live</);
  assert.doesNotMatch(equipment, /From Pulse|Fetched|Refresh from Pulse|Make changes in Pulse/);
  assert.doesNotMatch(equipment, /Save for review|data-import-format/);
  assert.match(await page('/pulse-masters?master=site', 'a'), /Majri OC/);
  assert.match(await page('/pulse-masters?master=region', 'a'), /Western Coalfields Limited/);
  const drivers = await page('/pulse-masters?master=driver', 'a');
  assert.match(drivers, /Mahesh Patel/);
  assert.match(drivers, /Last vehicle/);
  assert.match(drivers, /EX-7/);
  assert.match(drivers, /2026-11-20/);
  assert.match(drivers, /TIPPER DRIVER/);
  assert.doesNotMatch(drivers, /only directory drivers/);
  assert.match(await page('/pulse-masters?master=driver', 'v'), /Ravi Kumar/);
  assert.doesNotMatch(await page('/pulse-masters?master=driver', 'v'), /Mahesh Patel/);
  assert.equal(fetched, 1, 'one Pulse read serves every master while the copy is fresh');
  const searched = await page('/pulse-masters?master=equipment&q=fmx+460', 'a');
  assert.match(searched, /T-202/);
  assert.doesNotMatch(searched, /T-101/);

  const viewer = await page('/pulse-masters?master=employee', 'v');
  assert.match(viewer, /Ravi Kumar/);
  assert.doesNotMatch(viewer, /Anita Rao/);
  assert.match(viewer, /Site · Sasti/);
  assert.match(await page('/pulse-masters?master=site', 'v'), /Majri OC/);

  const exported = await req('/pulse-masters/records?master=employee', 'v', { headers: { Accept: 'application/json' } });
  assert.equal(exported.headers.get('cache-control'), 'no-store');
  const data = await exported.json();
  assert.deepEqual(data.columns, pulseMaster('employee').columns.map(([, label]) => label));
  assert.equal(data.records.length, 1);
  assert.equal(new Map(data.records[0].fields).get('Employee name'), 'Ravi Kumar');
  assert.doesNotMatch(JSON.stringify(data), /Anita Rao|passwordHash/);
  assert.equal((await req('/pulse-masters/records?master=employee', undefined, { headers: { Accept: 'application/json' } })).status, 401);

  const csv = await req('/pulse-masters/download?master=driver', 'a');
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  const text = await csv.text();
  assert.match(text, /Emp code,Driver name,Last site,Last vehicle,Last logbook date,Source/);
  assert.match(text, /'=9000000001/);

  assert.equal((await req('/pulse-masters/refresh', 'a', { method: 'POST' })).status, 404);

  currentFeed.masters.equipment[0].model = 'FMX Live';
  currentFeed.masters.employee[0].name = 'Ravi Updated';
  clock += 30_000;
  const updated = await Promise.all([
    page('/pulse-masters?master=equipment', 'a'), page('/pulse-masters?master=employee', 'v'),
  ]);
  assert.match(updated[0], /FMX Live/);
  assert.match(updated[1], /Ravi Updated/);
  assert.doesNotMatch(updated[1], /Anita Rao/);
  assert.equal(fetched, 2, 'automatic reads share one fresh copy across all masters');

  currentFeed.masters.driver[0].name = 'Updated driver';
  clock += 30_000;
  assert.match(await (await req('/pulse-masters/download?master=driver', 'a')).text(), /Updated driver/);
  assert.equal(fetched, 3, 'downloads fetch current data too');

  // The ERP availability notice is preserved while automatic retries continue.
  currentFeed.erpDrivers = false;
  clock += 30_000;
  assert.match(await page('/pulse-masters?master=driver', 'a'), /only directory drivers are shown/);
  assert.doesNotMatch(await page('/pulse-masters?master=site', 'a'), /only directory drivers/);
  assert.equal(fetched, 4);
  clock += 30_000;
  currentFeed.erpDrivers = true;
  assert.doesNotMatch(await page('/pulse-masters?master=driver', 'a'), /only directory drivers/);
  assert.equal(fetched, 5);

  pulseUp = false;
  clock += 30_000;
  const stale = await page('/pulse-masters?master=equipment', 'a');
  assert.match(stale, /Pulse could not be reached just now/);
  assert.match(stale, /T-101/, 'the last fetched copy stays available');
  assert.doesNotMatch(stale, /data-live-status|>Live</);
  assert.equal(fetched, 6);
  await page('/pulse-masters?master=employee', 'v');
  assert.equal(fetched, 6, 'an outage retries at the next interval instead of on every user request');
  assert.equal((await req('/pulse-masters/download?master=driver', 'a')).status, 503, 'downloads do not silently export stale data');
  assert.equal((await req('/pulse-masters/records?master=driver', 'a')).status, 503);
  pulseUp = true;
  clock += 30_000;
  const recovered = await page('/pulse-masters?master=equipment', 'a');
  assert.doesNotMatch(recovered, /could not be reached|Reconnecting/);
  assert.match(recovered, /FMX Live/);
  assert.equal(fetched, 7, 'automatically recovers without a manual refresh');
});
