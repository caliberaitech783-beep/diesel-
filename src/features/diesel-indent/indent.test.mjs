import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { openDieselDatabase } from '../../data/database.mjs';
import { createLocalWorkspace } from '../local-workspace/app.mjs';
import { validateDraft, siteToday } from './indent-rules.mjs';

test('E1 checks positive litres, real dates and the Indian business calendar date', () => {
  assert.equal(siteToday(new Date('2026-01-01T19:00Z')), '2026-01-02');
  const fields = { quantity: '1250.5', requiredBy: '2026-01-02', remarks: '' };
  assert.equal(validateDraft(fields, '2026-01-02'), '');
  for (const change of [{ quantity: '0' }, { quantity: '-1' }, { requiredBy: '2026-02-30' }, { requiredBy: '2026-01-01' }]) {
    assert.ok(validateDraft({ ...fields, ...change }, '2026-01-02'));
  }
});

test('a site maker can save and reopen a draft without posting stock or assigning an indent number', async t => {
  const db = openDieselDatabase(':memory:');
  const server = createLocalWorkspace(db).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); });
  const origin = 'http://127.0.0.1:' + server.address().port;
  const path = '/entries/indents';
  function post(url, values, cookie = '') {
    return fetch(origin + url, { method: 'POST', redirect: 'manual', headers: { origin, cookie }, body: new URLSearchParams(values) });
  }
  assert.match(await (await fetch(origin + '/records')).text(), /href="\/entries\/indents"/);
  const form = await (await fetch(origin + path + '/new')).text();
  assert.match(form, /Awaiting approved item 19726/);
  const url = form.match(/method="post" action="([^"]+)"/)[1];
  const values = { quantity: '880', requiredBy: siteToday(), remarks: 'Test draft', revision: '0' };
  assert.equal((await post(url, { ...values, quantity: '0' })).status, 422);
  const saved = await post(url, values);
  assert.equal(saved.status, 303);
  assert.equal(saved.headers.get('location'), url);
  assert.equal((await post(url, values)).status, 409);
  assert.match(await (await fetch(origin + path)).text(), /Test draft/);
  assert.match(await (await fetch(origin + url)).text(), /value="880"/);
  const edited = await post(url, { ...values, revision: '1', quantity: '900' });
  assert.equal(edited.status, 303);
  const checker = (await post('/workspace/role', { role: 'checker', site: 'Jayant' })).headers.get('set-cookie').split(';')[0];
  assert.equal((await post(url, { ...values, revision: '2' }, checker)).status, 403);
  const other = (await post('/workspace/role', { role: 'maker', site: 'Sasti' })).headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(origin + url, { headers: { cookie: other } })).status, 404);
  assert.equal((await post(url, { ...values, revision: '2' }, other)).status, 404);
});
