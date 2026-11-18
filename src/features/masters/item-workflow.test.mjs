import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmdirSync, unlinkSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { openDieselDatabase } from '../../data/database.mjs';
import { createLocalWorkspace } from '../local-workspace/app.mjs';
import { createApp } from '../../server.mjs';
import { openItemSubmissions } from './item-submissions.mjs';
import { createMasterStore, readActiveMasters } from './records.mjs';

const master = 'item-master';
const maker = { id: 'maker', name: 'Item editor' };
const checker = { id: 'checker', name: 'Item reviewer' };
const requiredValues = {
  'Item Code': 'TEST-001',
  'Item Name': 'Diesel test item',
  'Item Type': 'Consumable',
  'Group Name': 'Fuel',
  'Measuring Unit': 'L',
  'Stock A/c': 'Fuel stock',
  'Valuation Method': 'Weighted average',
  'Consumption / Variation A/c': 'Diesel consumption',
  SN: '1',
  'Item Specification': 'HSD BS VI',
  'HSN Code': '00123456',
  'Quality Required': 'Yes',
  Status: 'Active',
  'Density minimum (kg/m³)': '815',
  'Density maximum (kg/m³)': '845',
  'Volume basis': 'Observed litres',
};

function memoryStore(t) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  return { db, store: createMasterStore(db) };
}

test('Azure Item Master saves to app storage and only the submitting Pulse account can reopen the item', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'diesel-item-submissions-test-'));
  const env = {
    WEBSITE_SITE_NAME: 'diesel-test',
    DIESEL_PUBLIC_ORIGIN: 'https://diesel.test',
    DIESEL_SSO_CLIENT_SECRET: 's'.repeat(43),
    DIESEL_ALLOWED_PULSE_LOGINS: 'maker, other',
  };
  const maker = 'm'.repeat(43);
  const other = 'o'.repeat(43);
  const denied = 'd'.repeat(43);
  const profiles = new Map([[maker, 'maker'], [other, 'other'], [denied, 'denied']]);
  async function start() {
    const itemSubmissions = await openItemSubmissions(directory);
    const app = createApp({ env, itemSubmissions, async fetcher(url, options) {
      assert.equal(url.pathname, '/api/diesel-sso/validate');
      const login = profiles.get(JSON.parse(options.body).grant);
      return login ? Response.json({ profile: { login } }) : new Response(null, { status: 401 });
    } });
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => new Promise(resolve => server.close(resolve)));
    const base = 'http://127.0.0.1:' + server.address().port;
    return (path, grant, features = {}) => {
      const headers = grant ? { cookie: '__Host-diesel_session=' + grant } : {};
      return fetch(base + path, { ...features, headers: { ...headers, ...features.headers } });
    };
  }

  try {
    const request = await start();
    assert.equal((await (await request('/healthz')).json()).itemMaster, 'ready');
    const page = await request('/?master=item-master', maker);
    const form = await page.text();
    assert.match(form, /form="record-form" name="item-save">Save<\/button>/);
    assert.doesNotMatch(form, /Back to records/);
    const mastersPath = form.match(/href="([^"]+)" aria-label="Back to masters"[^>]*>\s*<svg\b/)?.[1];
    assert.equal(mastersPath, '/');
    const catalog = await (await request(mastersPath, maker)).text();
    assert.match(catalog, /Choose a master/);
    assert.doesNotMatch(catalog, /My item submissions/);
    assert.match(form, /<summary>Import and export<\/summary>/);
    for (const format of ['xlsx', 'csv', 'pdf']) {
      assert.ok(form.includes('data-import="' + format + '"'));
      assert.ok(form.includes('data-export="' + format + '"'));
    }
    for (const file of ['xlsx.mjs', 'csv-parse.mjs', 'csv-stringify.mjs', 'pdf-lib.mjs', 'fontkit.mjs', 'regenerator-runtime.mjs', 'item-font.ttf']) {
      const asset = await request('/masters/item-files/' + file, undefined, { method: 'HEAD' });
      assert.equal(asset.status, 200, file);
      assert.match(asset.headers.get('content-type'), file.endsWith('.ttf') ? /^font\/ttf/ : /^text\/javascript/);
    }
    const [, endpoint] = form.match(/data-api="([^"]+)"/);
    const pdf = Buffer.from('%PDF-1.4\n% Item specification\n%%EOF\n');
    const values = { ...requiredValues, Attachment: { name: 'reference.pdf', base64: pdf.toString('base64') } };
    function post(grant, fields, origin = env.DIESEL_PUBLIC_ORIGIN) {
      return request(endpoint, grant, {
        method: 'POST', headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({ values: fields }),
      });
    }
    assert.equal((await post(undefined, values)).status, 401);
    assert.equal((await post(denied, values)).status, 401);
    assert.equal((await post(maker, values, 'https://other.test')).status, 403);
    assert.equal((await post(maker, { ...values, 'Density maximum (kg/m³)': '810' })).status, 422);
    const results = await Promise.all([post(maker, values), post(maker, values)]);
    assert.deepEqual(results.map(result => result.status).sort(), [201, 409]);
    const saved = await results.find(result => result.status === 201).json();
    assert.equal(saved.status, 'pending');
    assert.equal(saved.values['HSN Code'], '00123456');

    const restarted = await start();
    const url = '/records?master=item-master&id=' + saved.id;
    const reopened = await (await restarted(url, maker)).text();
    assert.match(reopened, /Diesel test item/);
    assert.match(reopened, /href="\/" aria-label="Back to masters"[^>]*>\s*<svg\b/);
    assert.doesNotMatch(reopened, /Back to records/);
    assert.equal((await restarted(url, other)).status, 404);
    const records = await (await restarted('/records?master=item-master&q=TEST-001', maker)).text();
    assert.match(records, /Diesel test item/);
    const file = endpoint + '/' + saved.id + '/attachments/' + saved.values.Attachment.id;
    assert.deepEqual(Buffer.from(await (await restarted(file, maker)).arrayBuffer()), pdf);
    assert.equal((await restarted(file, other)).status, 404);
  } finally {
    assert.equal(dirname(directory), resolve(tmpdir()));
    await rm(directory, { recursive: true, force: true });
  }
});

test('Opening Item Master in the local workspace lets the maker save a new item for review', async t => {
  const db = openDieselDatabase(':memory:');
  const server = createLocalWorkspace(db).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    db.close();
  });
  const origin = 'http://127.0.0.1:' + server.address().port;
  const catalog = await (await fetch(origin)).text();
  const [, itemLink] = catalog.match(/href="([^"]+)">Item Master<\/a>/);
  const itemPage = await fetch(origin + itemLink.replaceAll('&amp;', '&'));
  assert.equal(itemPage.status, 200);
  const form = await itemPage.text();
  assert.match(form, /form="record-form" name="item-save">Save<\/button>/);
  const directLink = await fetch(origin + '/?master=item-master');
  assert.equal(directLink.url, itemPage.url);

  const [, endpoint] = form.match(/data-api="([^"]+)"/);
  const saved = await fetch(origin + endpoint, {
    method: 'POST', headers: { origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: requiredValues }),
  });
  assert.equal(saved.status, 201);
  const { id, status } = await saved.json();
  assert.equal(status, 'pending');
  const reopened = await (await fetch(origin + '/records?master=item-master&id=' + id)).text();
  assert.match(reopened, /Diesel test item/);
});

test('Item Master survives closing and reopening the SQLite file, including its optional attachment', t => {
  const directory = mkdtempSync(join(tmpdir(), 'diesel-item-test-'));
  const path = join(directory, 'items.sqlite');
  let db = new DatabaseSync(path);
  t.after(() => {
    db.close();
    unlinkSync(path);
    rmdirSync(directory);
  });
  const store = createMasterStore(db);
  const file = Buffer.from('%PDF-1.4\n% Item attachment fixture\n%%EOF\n');
  const values = { ...requiredValues, Attachment: { name: 'specification.pdf', base64: file.toString('base64') } };
  const saved = store.create(master, { values }, maker);
  db.close();
  db = new DatabaseSync(path);
  const reopened = createMasterStore(db);
  const [record] = reopened.list(master, { search: 'TEST-001' });
  assert.equal(record.id, saved.id);
  assert.equal(record.status, 'pending');
  assert.equal(record.revision, 1);
  assert.equal(record.values['HSN Code'], '00123456');
  const attachment = reopened.attachment(master, record.id, record.values.Attachment.id);
  assert.equal(attachment.name, 'specification.pdf');
  assert.deepEqual(Buffer.from(attachment.bytes), file);
  assert.deepEqual(reopened.snapshot(master, record.id, 1), record);
});

test('Item Master rejects missing fields and invalid densities without saving a partial record', t => {
  const { store } = memoryStore(t);
  for (const field of Object.keys(requiredValues)) {
    const values = { ...requiredValues };
    delete values[field];
    assert.throws(() => store.create(master, { values }, maker), error =>
      error.status === 422 && error.message.includes(field), field);
  }
  const invalid = [
    { 'Density minimum (kg/m³)': '0' },
    { 'Density minimum (kg/m³)': '-1' },
    { 'Density maximum (kg/m³)': '814' },
    { 'Density maximum (kg/m³)': 'NaN' },
    { 'Bulk Density': '-0.5' },
  ];
  for (const changed of invalid) {
    assert.throws(() => store.create(master, { values: { ...requiredValues, ...changed } }, maker),
      error => error.status === 422 && /density/i.test(error.message));
  }
  assert.deepEqual(store.list(master), []);
  const saved = store.create(master, { values: { ...requiredValues, 'Density maximum (kg/m³)': '815' } }, maker);
  assert.equal(saved.values['Density maximum (kg/m³)'], '815');
  assert.equal(saved.values.Attachment, undefined);
});

test('Item approvals preserve the last approved revision during review and reject stale or duplicate edits', t => {
  const { db, store } = memoryStore(t);
  const created = store.create(master, { values: requiredValues }, maker);
  assert.throws(() => store.create(master, { values: { ...requiredValues, 'Item Code': ' test-001 ' } }, maker),
    { status: 409 });
  assert.deepEqual(readActiveMasters(db, 'Jayant')[master], []);
  assert.throws(() => store.changeStatus(master, created.id, created.revision, 'approve', maker), { status: 403 });
  const approved = store.changeStatus(master, created.id, created.revision, 'approve', checker);
  const values = { ...approved.values, 'Item Name': 'Updated diesel test item' };
  assert.throws(() => store.update(master, approved.id, { revision: approved.revision, values }, maker), { status: 422 });
  const edited = store.update(master, approved.id, { revision: approved.revision, values, reason: 'Correct item name' }, maker);
  assert.equal(edited.status, 'pending');
  assert.equal(readActiveMasters(db, 'Jayant')[master][0].name, requiredValues['Item Name']);
  assert.throws(() => store.update(master, edited.id, { revision: approved.revision, values, reason: 'Outdated copy' }, maker),
    { status: 409 });
  const latest = store.changeStatus(master, edited.id, edited.revision, 'approve', checker);
  assert.equal(readActiveMasters(db, 'Jayant')[master][0].name, values['Item Name']);
  assert.equal(store.snapshot(master, latest.id, approved.revision).name, requiredValues['Item Name']);
  assert.equal(store.snapshot(master, latest.id, latest.revision).name, values['Item Name']);
  assert.deepEqual(store.history(master, latest.id).map(({ action, actorId, reason }) => [action, actorId, reason]), [
    ['approve', checker.id, ''],
    ['edited', maker.id, 'Correct item name'],
    ['approve', checker.id, ''],
    ['created', maker.id, ''],
  ]);
});
