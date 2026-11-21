import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createApp } from '../../server.mjs';
import { openItemSubmissions } from '../masters/item-submissions.mjs';
import { companyRecord, companyRecords } from './company-records.mjs';

test('the ERP sheets load as 71 storage locations and 165 accounts with unique codes', () => {
  const storage = companyRecords('storage-location-master'), accounts = companyRecords('account-master');
  assert.equal(storage.length, 71);
  assert.equal(accounts.length, 165);
  for (const list of [storage, accounts]) {
    assert.equal(new Set(list.map(record => record.code.toLowerCase())).size, list.length);
    assert.equal(new Set(list.map(record => record.id)).size, list.length);
    assert.ok(list.every(record => record.code && record.name && record.status === 'approved'));
  }
  assert.deepEqual(companyRecords('storage-location-master', 't33').map(record => [record.code, record.name, record.site, record.values['Storage type']]),
    [['T33', 'T33-MH34CQ1699', 'GHUGUS SIDING', 'Bowser']]);
  assert.equal(companyRecords('account-master', 'inventory diesel')[0].code, '2708');
  assert.deepEqual(companyRecords('item-master'), []);
  assert.equal(companyRecord('account-master', storage[0].id), null);
});

test('every signed-in person sees the company ERP records in Storage Location and Account Master, read-only', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'diesel-company-records-'));
  const itemSubmissions = await openItemSubmissions(directory);
  const app = createApp({ itemSubmissions,
    env: { WEBSITE_SITE_NAME: 'diesel-test', DIESEL_PUBLIC_ORIGIN: 'https://diesel.test', DIESEL_SSO_CLIENT_SECRET: 's'.repeat(43) },
    fetcher: async (_url, options) => JSON.parse(options.body).grant === 'u'.repeat(43)
      ? Response.json({ profile: { login: 'anyone', name: 'Any User' } }) : new Response(null, { status: 401 }) });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); });
  const get = (path, grant = 'u'.repeat(43)) => fetch('http://127.0.0.1:' + server.address().port + path,
    { redirect: 'manual', headers: { cookie: '__Host-diesel_session=' + grant } });

  assert.equal((await get('/master-data?master=storage-location-master', 'x'.repeat(43))).status, 303);
  const first = await (await get('/master-data?master=storage-location-master')).text();
  assert.match(first, /CHANDRAPUR HO/);
  assert.match(first, /offset=50/, '71 records continue on a second page');
  assert.match(await (await get('/master-data?master=storage-location-master&offset=50')).text(), /Tank truck \(TT\)/);
  assert.match(await (await get('/master-data?master=storage-location-master&q=T33')).text(), /MH34CQ1699/);

  const exported = await (await get('/api/master-data/records?master=account-master')).json();
  assert.equal(exported.records.length, 165);
  const account = exported.records.find(record => record.code === '2708');
  assert.equal(account.name, 'INVENTORY DIESEL');
  assert.equal(new Map(account.fields).get('Parent Group'), 'INVENTORY');

  const opened = await get('/records?master=account-master&id=' + account.id);
  assert.equal(opened.status, 200);
  const form = await opened.text();
  assert.match(form, /INVENTORY DIESEL/);
  assert.match(form, /2708 · approved · Revision 1/);
  assert.match(await (await get('/records?master=account-master&q=sandeep')).text(), /SANDEEP GASOLENES/);
  assert.equal((await get('/records?master=account-master&id=' + 'a'.repeat(64))).status, 404);
});
