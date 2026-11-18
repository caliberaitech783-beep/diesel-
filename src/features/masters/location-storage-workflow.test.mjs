import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { openDieselDatabase } from '../../data/database.mjs';
import { createLocalWorkspace } from '../local-workspace/app.mjs';
import { syncPulseProjects } from './pulse-projects.mjs';

const regions = [
  { name: 'Northern Coalfields Limited', sites: ['Jayant OC'] },
  { name: 'Western Coalfields Limited', sites: ['Sasti OC'] },
];
const location = {
  'Location Code': 'TEST-J', 'Business day cut-off': '06:00', 'Site In-charge': 'Test operator',
  'Project Manager': 'Test manager', 'Receipt scenario allowed': 'UG tank',
};
const storage = {
  'Storage Loc Code': 'TEST-B', 'Storage Loc. Name': 'Test bowser', Location: 'TEST-J',
  'Allow in Mobile Apps': 'Yes', 'Storage type': 'Bowser', 'Capacity (L)': '10000',
  'Safe fill level (L)': '9000', 'Minimum level (L)': '500',
  'Dispenser or flow meter ID': 'TEST-METER', 'GPS location': 'Test coordinates', Status: 'Active',
};

test('Location and storage follow site-scoped maker and checker approval through the local workspace', async t => {
  const db = openDieselDatabase(':memory:');
  const server = createLocalWorkspace(db).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    db.close();
  });
  const origin = 'http://127.0.0.1:' + server.address().port;
  async function signIn(role, site) {
    const res = await fetch(origin + '/workspace/role', {
      method: 'POST', redirect: 'manual', headers: { origin }, body: new URLSearchParams({ role, site }),
    });
    assert.equal(res.status, 303);
    return res.headers.get('set-cookie').split(';')[0];
  }
  const maker = await signIn('maker', 'Jayant');
  const checker = await signIn('checker', 'Jayant');
  const sasti = await signIn('maker', 'Sasti');
  const siteApi = '/api/masters/location-master/records';
  const storageApi = '/api/masters/storage-location-master/records';
  function request(path, cookie, body) {
    return fetch(origin + path, { method: body ? 'POST' : 'GET', headers: { origin, cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }
  async function submit(path, cookie, body, expected) {
    const res = await request(path, cookie, body);
    const result = await res.json();
    assert.equal(res.status, expected, result.error ?? path);
    return result;
  }
  await submit(siteApi, maker, { values: location }, 422);
  assert.deepEqual(syncPulseProjects(db, regions), syncPulseProjects(db, regions));
  assert.equal(db.prepare('SELECT count(*) AS count FROM pulse_projects').get().count, 2);
  const form = await (await request('/?master=location-master&new=1', maker)).text();
  assert.match(form, /Jayant OC/);
  const project = await submit(siteApi, maker, { values: { ...location, 'Location Name': 'Override', Client: 'Override' } }, 201);
  assert.equal(project.name, 'Jayant OC');
  assert.equal(project.values.Client, 'Northern Coalfields Limited');
  assert.equal(project.status, 'pending');
  await submit(siteApi, maker, { values: location }, 409);
  await submit(storageApi, maker, { values: storage }, 422);
  const siteUrl = siteApi + '/' + project.id;
  await submit(siteUrl + '/approve', maker, { revision: 1 }, 403);
  await submit(siteUrl + '/approve', checker, { revision: 1 }, 200);
  assert.equal((await request(siteUrl + '/history', sasti)).status, 404);
  await submit(storageApi, sasti, { values: storage }, 422);
  const picker = await (await request('/records?master=storage-location-master&new=1', maker)).text();
  assert.match(picker, /<option value="TEST-J">Jayant OC · TEST-J<\/option>/);
  const tank = { ...storage, 'Storage type': 'UG tank', 'Storage Loc Code': 'TEST-T', 'Storage Loc. Name': 'Test tank' };
  await submit(storageApi, maker, { values: tank }, 422);
  await submit(storageApi, maker, { values: { ...storage, 'Safe fill level (L)': '11000' } }, 422);
  for (const values of [storage, { ...tank, 'Calibration chart (dip-to-litres table, UG tanks)': 'Test calibration' }]) {
    const created = await submit(storageApi, maker, { values }, 201);
    const url = storageApi + '/' + created.id;
    await submit(url + '/approve', checker, { revision: 1 }, 200);
    const reopened = await (await request(url, maker)).json();
    assert.equal(reopened.status, 'approved');
    assert.equal(reopened.values.Location, project.code);
    assert.deepEqual((await (await request(url + '/history', maker)).json()).map(r => r.actorId), ['Jayant-checker', 'Jayant-maker']);
  }
  const approved = await (await request(siteUrl, maker)).json();
  assert.equal(approved.status, 'approved');
  await submit(siteUrl + '/deactivate', maker, { revision: approved.revision, reason: 'Test retirement' }, 409);
  const all = await (await request('/api/master-data/records', checker)).json();
  assert.deepEqual(all.records.map(record => record.slug), ['location-master', 'storage-location-master', 'storage-location-master']);
  assert.deepEqual((await (await request('/api/master-data/records?master=location-master', maker)).json()).records.map(record => record.code), ['TEST-J']);
  assert.deepEqual((await (await request('/api/master-data/records', sasti)).json()).records, []);
  assert.equal((await request('/api/master-data/records?master=account-master', maker)).status, 400);
});
