import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import express from 'express';
import { openDieselDatabase } from '../../data/database.mjs';
import { itemMaster } from './item-master.mjs';
import { registerMasterRecords } from './records-routes.mjs';

test('Item records enforce workspace roles and site scope on the page, writes, revisions and attachments', async t => {
  const db = openDieselDatabase(':memory:');
  const app = express();
  const maker = { id: 'maker', name: 'Site maker', site: 'Jayant', canEditMasters: true };
  const checker = { id: 'checker', name: 'Site checker', site: 'Jayant', canApproveMasters: true };
  const actors = { maker, checker, outsider: { ...checker, id: 'outside', site: 'Sasti' } };
  registerMasterRecords(app, { db, getActor: request => actors[request.get('test-actor')] });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    db.close();
  });
  const origin = 'http://127.0.0.1:' + server.address().port;
  const api = '/api/masters/item-master/records';
  function request(path, actor = 'maker', method = 'GET', body, extra = {}) {
    return fetch(origin + path, {
      method, headers: { 'test-actor': actor, 'Content-Type': 'application/json', ...extra },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  assert.equal((await request('/records', 'anonymous')).status, 401);
  for (const path of ['/records?master=account-master', '/api/masters/account-master/records', '/api/masters/account-master/records/sample/history',
    '/api/masters/account-master/records/sample/attachments/file', '/api/masters/account-master/records/template']) {
    assert.equal((await request(path)).status, 404, path);
  }
  assert.equal((await request('/records?new=1', 'checker')).status, 403);
  const catalog = await (await request('/records')).text();
  assert.match(catalog, /href="\/records\?master=item-master&amp;new=1"/);
  const page = await (await request('/records?new=1')).text();
  assert.match(page, /<div class="form-footer"><button type="submit" data-save-for-review>Save for review<\/button>/);
  assert.match(page, /href="\/records" aria-label="Back to masters"[^>]*>\s*<svg\b/);
  assert.doesNotMatch(page, /id="masters-sidebar"|class="master-group"/);
  const values = Object.fromEntries(itemMaster.flatMap(section => section.fields).filter(field => field.required).map(field =>
    [field.label, field.options?.[0] ?? (field.type === 'number' ? '820' : 'Sample')]));
  const pdf = Buffer.from('%PDF-1.4\nsample\n%%EOF');
  Object.assign(values, { Status: 'Active', 'Item Code': 'D-01', Attachment: { name: 'item.pdf', base64: pdf.toString('base64') } });
  assert.equal((await request(api, 'checker', 'POST', { values })).status, 403);
  assert.equal((await request(api, 'maker', 'POST', { values }, { origin: 'https://elsewhere.example' })).status, 403);
  assert.equal((await request(api, 'maker', 'POST', { site: 'Sasti', values })).status, 403);
  const created = await request(api, 'maker', 'POST', { values });
  assert.equal(created.status, 201);
  const record = await created.json();
  const endpoint = api + '/' + record.id;
  const fileUrl = endpoint + '/attachments/' + record.values.Attachment.id;
  assert.deepEqual(await (await request(api, 'outsider')).json(), []);
  for (const path of [endpoint, endpoint + '/history', endpoint + '/revisions/1', fileUrl, '/records?id=' + record.id]) {
    assert.equal((await request(path, 'outsider')).status, 404);
  }
  const attachment = await request(fileUrl, 'checker');
  assert.match(attachment.headers.get('content-disposition'), /^attachment;/);
  assert.deepEqual(Buffer.from(await attachment.arrayBuffer()), pdf);
  assert.equal((await request(endpoint + '/approve', 'maker', 'POST', { revision: 1 })).status, 403);
  assert.equal((await request(endpoint + '/approve', 'checker', 'POST', { revision: 1 })).status, 200);
  assert.equal((await request(endpoint + '/deactivate', 'maker', 'POST', { revision: 2 })).status, 422);
  const retiring = await request(endpoint + '/deactivate', 'maker', 'POST', { revision: 2, reason: 'Replaced' });
  assert.equal((await retiring.json()).status, 'pending_deactivation');
  const inactive = await request(endpoint + '/approve', 'checker', 'POST', { revision: 3 });
  assert.equal((await inactive.json()).status, 'inactive');
  const reactivating = await request(endpoint + '/reactivate', 'maker', 'POST', { revision: 4, reason: 'Needed again' });
  assert.equal((await reactivating.json()).status, 'pending');
  const renewed = await request(endpoint + '/approve', 'checker', 'POST', { revision: 5 });
  assert.equal((await renewed.json()).status, 'approved');
  const history = await (await request(endpoint + '/history')).json();
  assert.equal(history.length, 6);
  assert.equal(history.find(event => event.action === 'deactivate').reason, 'Replaced');
  const historical = await (await request('/records?id=' + record.id + '&revision=1')).text();
  assert.ok(historical.includes('Revision 1') && historical.includes('Open current record'));
  assert.doesNotMatch(historical, /data-save-for-review|<summary>Import<\/summary>|data-import=/);
  assert.match(historical, /data-export="xlsx"/);
});
