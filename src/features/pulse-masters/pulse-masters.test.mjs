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
const feed = () => ({ masters: {
  region: [{ id: '1', name: 'Western Coalfields Limited', code: 'WCL', state: 'MH / MP', sites: 'Sasti OC | Majri OC' }],
  site: [{ name: 'Sasti OC', region: 'Western Coalfields Limited', regionCode: 'WCL', state: 'MH / MP' },
    { name: 'Majri OC', region: 'Western Coalfields Limited', regionCode: 'WCL', state: 'MH / MP' }],
  equipment: [{ door: 'T-101', reg: 'MH34AB1234', currentLocation: 'Sasti OC', make: 'Volvo', model: 'FMX 500' },
    { door: 'T-202', reg: 'MH34CD5678', currentLocation: 'Majri OC', make: 'Volvo', model: 'FMX 460' }],
  employee: [{ empId: 'E001', name: 'Ravi Kumar', site: 'Sasti OC', designation: 'TIPPER DRIVER', phone: '9000000001', passwordHash: 'never' },
    { empId: 'E002', name: 'Anita Rao', site: 'Majri OC', designation: 'Store Keeper' }],
  driver: [{ empId: 'E001', name: 'Ravi Kumar', site: 'Sasti OC', designation: 'TIPPER DRIVER', phone: '=9000000001' }],
} });

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
  const app = createApp({
    env: { WEBSITE_SITE_NAME: 'diesel', DIESEL_PUBLIC_ORIGIN: origin, DIESEL_SSO_CLIENT_SECRET: 's'.repeat(43), DIESEL_ALLOWED_PULSE_LOGINS: 'admin' },
    itemSubmissions, sharedMasterDb: db, pulseMasterClock: () => clock,
    fetcher: async (url, options) => {
      const { grant } = JSON.parse(options.body);
      if (url.pathname.endsWith('/masters')) {
        assert.equal(options.headers.Authorization, 'Bearer ' + 's'.repeat(43));
        fetched++;
        return pulseUp ? Response.json(feed()) : new Response('', { status: 503 });
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
  assert.match(equipment, /From Pulse · read-only · 2 records/);
  assert.doesNotMatch(equipment, /Save for review|data-import-format/);
  assert.match(await page('/pulse-masters?master=site', 'a'), /Majri OC/);
  assert.match(await page('/pulse-masters?master=region', 'a'), /Western Coalfields Limited/);
  assert.match(await page('/pulse-masters?master=driver', 'a'), /TIPPER DRIVER/);
  assert.equal(fetched, 1, 'one Pulse read serves every master while the copy is fresh');
  const searched = await page('/pulse-masters?master=equipment&q=fmx+460', 'a');
  assert.match(searched, /T-202/);
  assert.doesNotMatch(searched, /T-101/);

  const viewer = await page('/pulse-masters?master=employee', 'v');
  assert.match(viewer, /Ravi Kumar/);
  assert.doesNotMatch(viewer, /Anita Rao/);
  assert.match(viewer, /Site · Sasti/);
  assert.match(await page('/pulse-masters?master=site', 'v'), /Majri OC/);

  const csv = await req('/pulse-masters/download?master=driver', 'a');
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  const text = await csv.text();
  assert.match(text, /Emp ID,Employee name/);
  assert.match(text, /'=9000000001/);

  const post = (who, headers) => req('/pulse-masters/refresh', who, { method: 'POST', body: new URLSearchParams({ master: 'site' }),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers } });
  assert.equal((await post('a', { Origin: 'https://elsewhere.test' })).status, 403);
  assert.equal(fetched, 1);
  assert.equal((await post('a', { Origin: origin })).headers.get('location'), '/pulse-masters?master=site');
  assert.equal(fetched, 2);

  pulseUp = false;
  clock += 16 * 60_000;
  const stale = await page('/pulse-masters?master=equipment', 'a');
  assert.match(stale, /Pulse could not be reached just now/);
  assert.match(stale, /T-101/, 'the last fetched copy stays available');
  assert.match((await post('a', { Origin: origin })).headers.get('location'), /refreshed=0/);
});
