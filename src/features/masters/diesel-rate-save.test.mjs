import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createApp } from '../../server.mjs';
import { openItemSubmissions } from './item-submissions.mjs';

const slug = 'diesel-rate-master';
const rate = { Supplier: 'IOCL', Depot: 'Nagpur', 'Price basis (EXMI / Delivered)': 'EXMI', 'Effective from': '2026-11-25',
  'Basic rate (₹/Ltr)': '80', 'Excise duty (₹/Ltr)': '2', 'VAT (%) by state': '18' };

test('a saved diesel rate shows in the Diesel Rate Master list, one per Location', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'diesel-rate-save-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const itemSubmissions = await openItemSubmissions(directory);
  const env = { WEBSITE_SITE_NAME: 'diesel-test', DIESEL_PUBLIC_ORIGIN: 'https://diesel.test', DIESEL_SSO_CLIENT_SECRET: 's'.repeat(43),
    DIESEL_ALLOWED_PULSE_LOGINS: 'maker', DIESEL_PULSE_ACCESS: 'listed' };
  const app = createApp({ env, itemSubmissions, async fetcher(url) {
    return url.pathname === '/api/diesel-sso/validate' ? Response.json({ profile: { login: 'maker' } }) : new Response(null, { status: 404 });
  } });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port;
  const cookie = '__Host-diesel_session=' + 'm'.repeat(43);
  const save = values => fetch(base + '/api/masters/' + slug + '/records', { method: 'POST',
    headers: { cookie, origin: 'https://diesel.test', 'content-type': 'application/json' }, body: JSON.stringify({ values }) });

  const form = await (await fetch(base + '/records?master=' + slug + '&new=1', { headers: { cookie } })).text();
  // After a save the page stays on a blank form; the record is still listed in Diesel Rate Master data (checked below).
  assert.match(form, /data-stay-after-save="\/records\?master=diesel-rate-master&amp;new=1&amp;saved=1"/);

  assert.equal((await save({ ...rate, Location: 'CMPL Nagpur' })).status, 201);
  assert.equal((await save({ ...rate, Location: 'CMPL Chandrapur' })).status, 201);
  assert.equal((await save({ ...rate, Location: 'CMPL Chandrapur' })).status, 409);

  const list = await (await fetch(base + '/master-data?master=' + slug, { headers: { cookie } })).text();
  assert.match(list, /CMPL Nagpur/);
  assert.match(list, /CMPL Chandrapur/);
  assert.doesNotMatch(list, /No saved records for this master/);
});
