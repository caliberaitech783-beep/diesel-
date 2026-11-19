import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createApp } from '../../server.mjs';
import { openDieselDatabase } from '../../data/database.mjs';
import { roleKey } from '../entries/review-masters.mjs';
import { createPulseMasterStore } from '../pulse-masters/pulse-master-store.mjs';
import { approvedLocationDirectory, createMasterStore } from './records.mjs';
import { createLocationsFromPulseSites, locationCode, pulseSiteFor } from './pulse-site-locations.mjs';

const pulseSites = [
  { name: 'Sasti OC', region: 'Western Coalfields Limited', regionCode: 'WCL', state: 'MH / MP' },
  { name: 'Dudhichua East', region: 'Northern Coalfields Limited', regionCode: 'NCL', state: 'MP' },
  { name: 'Twin', region: 'Client A', regionCode: 'A', state: 'MH' }, { name: 'Twin OC', region: 'Client B', regionCode: 'B', state: 'MH' },
];

test('a site named in a Pulse role gets an approved Location Master record from the Pulse Site Master', t => {
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
    ['Pulse Site Master','Pulse Site Master (automatic)']);

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

test('Entry opens live for a person with a role at a Pulse site and as a private trial for everyone else', async t => {
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
  assert.match(first, /class="trial-notice".*No site from your Pulse roles has a Location Master record yet/s);
  assert.match(first, /Reason:<\/strong> Pulse sent no Diesel site role for your login/);
  assert.equal((await request('/entries/new/E1', 'n')).status, 200);
  assert.equal((await request('/entries/new/E11', 'n')).status, 403);
  const asBowser = await request('/workspace/role', 'n', new URLSearchParams({ site: 'Sasti', role: roleKey('Bowser operator') }));
  assert.equal(asBowser.status, 303);
  assert.match(await (await request('/entries/new/E11', 'n', null, asBowser.headers.get('set-cookie').split(';')[0])).text(), /Vehicle or fleet number/);
  assert.equal((await request('/workspace/role', 'n', new URLSearchParams({ site: 'Unknown', role: roleKey('CFO') }))).status, 400);
  assert.match(await health(), /no approved Location Master record/);

  const unlisted = await (await request('/entries', 'x')).text();
  assert.match(unlisted, /Reason:<\/strong> The Pulse Site Master has no site matching your role site: Not in Pulse\./);
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
    assert.match(sandbox, /class="trial-notice".*no Diesel Entry role at an approved site/s);
    assert.match(sandbox, who === 'n' ? /Pulse sent no Diesel site role for your login/ : /no site matching your role site: Not in Pulse/);
    assert.doesNotMatch(sandbox, /Site stock workspace/);
  }
  assert.deepEqual(approvedLocationDirectory(masterDb).length, 1);
});
