import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createEntryStore } from '../entries/entry-store.mjs';
import { businessDay } from '../entries/entry-rules.mjs';
import { createApp } from '../../server.mjs';
import { openDieselDatabase } from '../../data/database.mjs';
import { roleKey, sites } from '../entries/review-masters.mjs';
import { createPulseMasterStore } from '../pulse-masters/pulse-master-store.mjs';
import { approvedLocationDirectory, createMasterStore } from './records.mjs';
import { createLocationsFromPulseSites, locationCode, pulseSiteFor } from './pulse-site-locations.mjs';

const pulseSites = [
  { name: 'Sasti OC', region: 'Western Coalfields Limited', regionCode: 'WCL', state: 'MH / MP' },
  { name: 'Dudhichua East', region: 'Northern Coalfields Limited', regionCode: 'NCL', state: 'MP' },
  { name: 'Twin', region: 'Client A', regionCode: 'A', state: 'MH' }, { name: 'Twin OC', region: 'Client B', regionCode: 'B', state: 'MH' },
];

test('a site named in a Pulse role gets an approved Location Master record from the Pulse Location Master', t => {
  const db = openDieselDatabase(':memory:');
  t.after(() => db.close());
  const masters = createMasterStore(db, ['location-master','storage-location-master']);
  assert.equal(pulseSiteFor('sasti', pulseSites).name, 'Sasti OC');
  assert.equal(pulseSiteFor('Twin', pulseSites), null);
  assert.equal(locationCode(' Dudhichua  East (NCL) '), 'DUDHICHUA-EAST-NCL');
  const grants = [{ site: 'Sasti' }, { site: 'Dudhichua East' }, { site: 'Twin' }, { site: 'Not in Pulse' }, { site: '' },
    { site: 'Majri', project: { name: 'Majri OC', client: 'Western Coalfields Limited' } }];
  assert.deepEqual(createLocationsFromPulseSites(db, grants, pulseSites), { created: ['Sasti','Dudhichua East','Majri'], missing: ['Twin','Not in Pulse'] });
  assert.deepEqual(createLocationsFromPulseSites(db, grants, pulseSites).created, []);
  assert.deepEqual(createLocationsFromPulseSites(db, [{ site: 'Not in Pulse' }], [...pulseSites, { name: 'Not in Pulse', region: 'Client C' }]).created, ['Not in Pulse']);
  assert.deepEqual(approvedLocationDirectory(db), [{ site: 'Dudhichua East', pulseName: 'Dudhichua East' },
    { site: 'Majri', pulseName: 'Majri OC' }, { site: 'Not in Pulse', pulseName: 'Not in Pulse' }, { site: 'Sasti', pulseName: 'Sasti OC' }]);
  const [sasti] = masters.list('location-master', { site: 'Sasti' });
  assert.equal(sasti.status, 'approved');
  assert.deepEqual([sasti.code, sasti.name, sasti.values.Client, sasti.values['Short Name'], sasti.values['Receipt scenario allowed'],
    sasti.values['Business day cut-off']], ['SASTI-OC','Sasti OC','Western Coalfields Limited','Sasti','Both','06:00']);
  assert.deepEqual(sasti.attributes.map(row => [row.name, row.value]), [['State','MH / MP']]);
  assert.deepEqual(masters.history('location-master', sasti.id).map(event => event.actorName).sort(),
    ['Pulse Location Master','Pulse Location Master (automatic)']);

  // A maker can replace the generated code with the company's own until storage records use it.
  const maker = { id: 'maker', site: 'Sasti' };
  const recoded = masters.update('location-master', sasti.id, { revision: sasti.revision, site: 'Sasti', reason: 'Use the iBoss code',
    values: { ...sasti.values, 'Location Code': 'L-014', 'Receipt scenario allowed': 'UG tank' } }, maker);
  assert.deepEqual([recoded.code, recoded.status], ['L-014','pending']);
  const approved = masters.changeStatus('location-master', recoded.id, recoded.revision, 'approve', { id: 'checker' });
  const tank = masters.create('storage-location-master', { site: 'Sasti', values: { 'Storage Loc Code': 'T-1', 'Storage Loc. Name': 'Tank',
    Location: 'L-014', 'Allow in Mobile Apps': 'Yes', 'Storage type': 'Bowser', 'Capacity (L)': '10', 'Safe fill level (L)': '9',
    'Minimum level (L)': '1', 'Dispenser or flow meter ID': 'M', 'GPS location': 'x', Status: 'Active' } }, maker);
  assert.equal(tank.status, 'pending');
  assert.throws(() => masters.update('location-master', approved.id, { revision: approved.revision, site: 'Sasti', reason: 'Recode',
    values: { ...approved.values, 'Location Code': 'L-015' } }, maker), /used by storage records and cannot change/);
});

test('Entry opens live for a person with a role at a Pulse site and as a trial for everyone else', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'diesel-pulse-locations-'));
  const origin = 'https://diesel.test', masterDb = openDieselDatabase(':memory:');
  createMasterStore(masterDb, ['location-master']);
  createPulseMasterStore(masterDb).replace({ site: pulseSites, region: [], equipment: [], employee: [], driver: [] }, new Date().toISOString());
  const profiles = { s: { login: 'site-incharge', dieselEntryAccess: [{ site: 'Sasti', role: 'Site In-charge' }] },
    n: { login: 'no-role' }, x: { login: 'elsewhere', dieselEntryAccess: [{ site: 'Not in Pulse', role: 'Project Manager' }] } };
  const app = createApp({ env: { WEBSITE_SITE_NAME: 'diesel', DIESEL_PUBLIC_ORIGIN: origin, DIESEL_SSO_CLIENT_SECRET: 's'.repeat(43) },
    entryReviewDirectory: dir, siteMasterDb: masterDb,
    fetcher: async (_url, options) => Response.json({ profile: profiles[JSON.parse(options.body).grant[0]] }) });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); masterDb.close(); await rm(dir, { recursive: true, force: true }); });
  const address = 'http://127.0.0.1:' + server.address().port;
  const request = (path, who, body, cookie = '') => fetch(address + path, { redirect: 'manual', method: body ? 'POST' : 'GET',
    headers: { Origin: origin, cookie: '__Host-diesel_session=' + who.repeat(43) + (cookie && '; ' + cookie) }, body });
  const health = async () => (await (await fetch(address + '/healthz')).json()).entrySetup;
  assert.match(await health(), /no approved Location Master record/);

  const first = await (await request('/entries', 'n')).text();
  assert.match(first, /Trial workspace · sample data · not live records/);
  assert.equal((await request('/entries/new/E1', 'n')).status, 200);
  assert.equal((await request('/entries/new/E11', 'n')).status, 403);
  const asBowser = await request('/workspace/role', 'n', new URLSearchParams({ site: 'Sasti', role: roleKey('Bowser operator') }));
  assert.equal(asBowser.status, 303);
  assert.match(await (await request('/entries/new/E11', 'n', null, asBowser.headers.get('set-cookie').split(';')[0])).text(), /Vehicle or fleet number/);
  assert.equal((await request('/workspace/role', 'n', new URLSearchParams({ site: 'Unknown', role: roleKey('CFO') }))).status, 400);
  assert.match(await health(), /no approved Location Master record/);

  await request('/entries', 'x');
  assert.deepEqual((await (await fetch(address + '/healthz')).json()).entryLocationRun,
    { roleSites: 1, created: 0, notInPulseSiteMaster: 1, pulseSites: 4, entryRoles: 1 });
  const live = await (await request('/entries/opening-stock', 's')).text();
  assert.equal(await health(), 'ready');
  assert.match(live, /Site stock workspace/);
  assert.match(live, /Approve an Item Master record/);
  assert.doesNotMatch(live, /Trial workspace|sample data/);
  assert.deepEqual(approvedLocationDirectory(masterDb), [{ site: 'Sasti', pulseName: 'Sasti OC' }]);

  for (const who of ['n','x']) {
    const sandbox = await (await request('/entries', who)).text();
    assert.doesNotMatch(sandbox, /Site stock workspace|trial-notice/);
    assert.match(sandbox, /Trial workspace · sample data · not live records/);
  }
  assert.deepEqual(approvedLocationDirectory(masterDb).length, 1);
});

test('everyone in the trial sees the records anyone saved, including those from earlier private workspaces', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'diesel-shared-trial-'));
  const origin = 'https://diesel.test', masterDb = openDieselDatabase(':memory:');
  createMasterStore(masterDb, ['location-master']);
  const earlier = new DatabaseSync(join(dir, 'trial-' + 'a'.repeat(64) + '.sqlite'));
  const actor = { site: 'Sasti', profile: roleKey('Site In-charge'), id: 'Sasti-' + roleKey('Site In-charge'), hosted: true };
  const old = createEntryStore(earlier).write(randomUUID(), actor, { type: 'E1', action: 'Submit', rev: 0, day: businessDay(),
    data: { litres: 900, requiredBy: 0, remarks: 'Saved before sharing' } });
  earlier.close();
  const app = createApp({ env: { WEBSITE_SITE_NAME: 'diesel', DIESEL_PUBLIC_ORIGIN: origin, DIESEL_SSO_CLIENT_SECRET: 's'.repeat(43) },
    entryReviewDirectory: dir, siteMasterDb: masterDb,
    fetcher: async (_url, options) => Response.json({ profile: { login: 'person-' + JSON.parse(options.body).grant[0] } }) });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); masterDb.close(); await rm(dir, { recursive: true, force: true }); });
  const address = 'http://127.0.0.1:' + server.address().port;
  const request = (path, who, body, cookie = '', json = false) => fetch(address + path, { redirect: 'manual', method: body ? 'POST' : 'GET',
    headers: { Origin: origin, ...(json ? { 'content-type': 'application/json' } : {}), cookie: '__Host-diesel_session=' + who.repeat(43) + (cookie && '; ' + cookie) }, body });
  const atSasti = async who => (await request('/workspace/role', who, new URLSearchParams({ site: 'Sasti', role: roleKey('Site In-charge') }))).headers.get('set-cookie').split(';')[0];

  const p = await atSasti('p'), q = await atSasti('q');
  assert.match(await (await request('/entries/type/E1', 'p', null, p)).text(), new RegExp(old.number), 'a record from a private workspace is brought in');
  const other = sites.find(site => !['Sasti', 'Jayant'].includes(site)), id = randomUUID();
  const at = async who => (await request('/workspace/role', who, new URLSearchParams({ site: other, role: roleKey('Site In-charge') }))).headers.get('set-cookie').split(';')[0];
  const p2 = await at('p'), q2 = await at('q');
  const saved = await request('/entries/record/' + id, 'p', JSON.stringify({ actor: other + '-' + roleKey('Site In-charge'), type: 'E1', action: 'Submit', rev: 0, day: businessDay(),
    data: { litres: 700, requiredBy: 0, remarks: 'Shared indent' } }), p2, true);
  assert.equal(saved.status, 200, await saved.clone().text());
  const seen = await request('/entries/record/' + id, 'q', null, q2);
  assert.equal(seen.status, 200, 'another person opens the record');
  assert.match(await (await request('/entries/type/E1', 'q', null, q)).text(), new RegExp(old.number));
});

test('a location added in Diesel, such as a CMPL office, can be chosen for a diesel indent', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'diesel-added-location-'));
  const origin = 'https://diesel.test', masterDb = openDieselDatabase(':memory:');
  createMasterStore(masterDb, ['location-master']);
  createPulseMasterStore(masterDb).replace({ site: pulseSites, region: [], equipment: [], employee: [{ empId: 'person', name: 'A Person' }], driver: [] }, new Date().toISOString());
  createPulseMasterStore(masterDb).add('site', [{ name: 'CMPL Nagpur', state: 'MH' }], 'Diesel', new Date().toISOString());
  const app = createApp({ env: { WEBSITE_SITE_NAME: 'diesel', DIESEL_PUBLIC_ORIGIN: origin, DIESEL_SSO_CLIENT_SECRET: 's'.repeat(43) },
    entryReviewDirectory: dir, siteMasterDb: masterDb, fetcher: async () => Response.json({ profile: { login: 'person' } }) });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); masterDb.close(); await rm(dir, { recursive: true, force: true }); });
  const address = 'http://127.0.0.1:' + server.address().port;
  const request = (path, body, cookie = '', json = false) => fetch(address + path, { redirect: 'manual', method: body ? 'POST' : 'GET',
    headers: { Origin: origin, ...(json ? { 'content-type': 'application/json' } : {}), cookie: '__Host-diesel_session=' + 'p'.repeat(43) + (cookie && '; ' + cookie) }, body });
  assert.match(await (await request('/entries/new/E1')).text(), /<option value="CMPL Nagpur">CMPL Nagpur<\/option>/);
  const chosen = await request('/workspace/role', new URLSearchParams({ site: 'CMPL Nagpur', role: roleKey('Site In-charge'), returnTo: '/entries/new/E1', indentSite: '1' }));
  assert.equal(chosen.status, 303);
  const cookie = chosen.headers.get('set-cookie').split(';')[0];
  const form = await request(chosen.headers.get('location'), null, cookie);
  assert.equal(form.status, 200);
  const html = await form.text();
  assert.match(html, /<option value="CMPL Nagpur" selected>/);
  const reason = /<select name="reason"[^>]*>(?:<option value=""[^>]*>[^<]*<\/option>)?<option value="([^"]+)"/.exec(html)[1];
  const id = /data-id="([\w-]+)"/.exec(html)[1], rev = Number(/data-rev="(\d+)"/.exec(html)[1]);
  const saved = await request('/entries/record/' + id, JSON.stringify({ actor: 'CMPL Nagpur-' + roleKey('Site In-charge'), type: 'E1', action: 'Save indent', rev, site: 'CMPL Nagpur',
    day: businessDay(), data: { litres: 500, requiredBy: 0, priority: 'Normal', reason, remarks: '' } }), cookie, true);
  assert.equal(saved.status, 200, await saved.clone().text());
  assert.match(await (await request('/entries/type/E1', null, cookie)).text(), /CMLL\/[A-Z]+\/IND\//);
  assert.equal((await request('/workspace/role', new URLSearchParams({ site: 'Nowhere', role: roleKey('Site In-charge') }))).status, 400);
});
