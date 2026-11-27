import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createApp } from '../../server.mjs';
import { businessDay } from './entry-rules.mjs';
import { roleKey, review } from './review-masters.mjs';

test('verified Pulse role grants share pilot entries by site and require a different account to approve', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'diesel-assigned-entry-'));
  const origin = 'https://diesel.test';
  const jay = role => ({ site: 'Jayant OC', role });
  const sasti = role => ({ site: 'Sasti', role });
  const profiles = {
    i: { login: 'Initiator', dieselEntryAccess: [jay('Site In-charge'), jay('Project Manager')] },
    m: { login: 'Manager', dieselEntryAccess: [jay('Project Manager'), sasti('Procurement Executive')] },
    h: { login: 'ProcurementHead', dieselEntryAccess: [jay('Head of Procurement')] },
    p: { login: 'ProcurementMaker', dieselEntryAccess: [jay('Procurement Executive')] },
    o: { login: 'OtherSiteManager', dieselEntryAccess: [sasti('Project Manager')] },
    l: { login: 'legacy' },
  };
  const env = { DIESEL_ACCESS_MODE: 'pulse', DIESEL_PUBLIC_ORIGIN: origin,
    DIESEL_ALLOWED_PULSE_LOGINS: 'legacy', DIESEL_ENTRY_ACCESS_MODE: 'assigned-pilot',
    DIESEL_SSO_CLIENT_SECRET: 's'.repeat(43) };
  const app = createApp({ env, entryReviewDirectory: directory, itemSubmissions: {},
    fetcher: async (url, options) => {
      if (url.pathname.endsWith('/exchange')) return Response.json({ grant: 'i'.repeat(43) });
      assert.equal(url.pathname, '/api/diesel-sso/validate');
      return Response.json({ profile: profiles[JSON.parse(options.body).grant[0]] });
    } });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  function request(path, who, { context = '', headers, ...options } = {}) {
    const identity = who ? ['__Host-diesel_session=' + who.repeat(43)] : [];
    if (context) identity.push('__Host-diesel_entry_assignment=' + context);
    return fetch(base + path, { redirect: 'manual', ...options,
      headers: { cookie: identity.join('; '), ...headers } });
  }
  function write(id, who, site, role, fields, context = '') {
    return request('/entries/record/' + id, who, {
      method: 'POST', context, headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: JSON.stringify([profiles[who].login.toLowerCase(), site + '.' + roleKey(role)]), ...fields }),
    });
  }

  const signIn = await request('/entries');
  assert.equal(signIn.status, 303);
  const state = new URL(signIn.headers.get('location')).searchParams.get('state');
  const callback = await request('/api/sign-in/callback?' + new URLSearchParams({ state, code: 'c'.repeat(43) }),
    null, { headers: { cookie: signIn.headers.get('set-cookie').split(';')[0] } });
  assert.equal(callback.status, 303);
  assert.equal(callback.headers.get('location'), '/entries');
  // A plain sign-in, with no page asked for, opens the Diesel Dashboard.
  const plain = await request('/api/sign-in/start');
  const plainState = new URL(plain.headers.get('location')).searchParams.get('state');
  const landed = await request('/api/sign-in/callback?' + new URLSearchParams({ state: plainState, code: 'c'.repeat(43) }),
    null, { headers: { cookie: plain.headers.get('set-cookie').split(';')[0] } });
  assert.equal(landed.headers.get('location'), '/entries/dashboard');
  assert.equal((await request('/api/master-data/records', 'i')).status, 401);
  assert.equal((await request('/entries', 'l')).status, 403);
  assert.equal((await request('/entries/new/E1', 'm')).status, 403);
  assert.equal((await request('/entries/type/E3', 'i')).status, 404);
  const initial = await (await request('/entries', 'i')).text();
  assert.match(initial, /Role-based pilot · sample data/);
  assert.match(initial, /No entries match this view/);
  assert.doesNotMatch(initial, /Sasti|Review role/);

  const indent = randomUUID(), day = businessDay();
  const submit = { type: 'E1', action: 'Submit', rev: 0, day, data: { litres: 1500, requiredBy:0 } };
  assert.equal((await write(indent, 'i', 'Jayant', 'Site In-charge', submit)).status, 200);
  const indentPath = '/entries/record/' + indent;
  // The shared page helpers answer for a signed-in person and stay within what that person may open.
  const number = (await (await request('/entries/search.json?q=ind', 'i')).json())[0];
  assert.equal(number.href, indentPath);
  assert.deepEqual(await (await request('/entries/search.json?q=ind', 'o')).json(), [], 'another site does not find it');
  assert.equal(typeof (await (await request('/entries/pending.json', 'i')).json()).total, 'number');
  assert.match(await (await request('/entries/shell-parts.html', 'i')).text(), /<template id="shell-parts">[\s\S]*id="global-search"/);
  const ticked = await (await request('/entries/export.csv?ids=' + randomUUID(), 'i')).text();
  assert.equal(ticked.trim().split('\n').length, 1, 'only ticked records are exported');
  assert.equal((await request(indentPath, 'o')).status, 404);
  assert.doesNotMatch(await (await request('/entries/export.csv', 'o')).text(), /E1-JAY/);
  assert.doesNotMatch(await (await request('/entries/approvals', 'm')).text(), new RegExp(indentPath));
  assert.doesNotMatch(await (await request('/entries/approvals', 'h')).text(), new RegExp(indentPath));
  assert.equal((await write(indent, 'h', 'Jayant', 'Head – Procurement', { action: 'Approve', rev: 1 })).status, 422);

  const switchTo = (actor, context) => request('/workspace/role', actor, { method: 'POST',
    headers: { Origin: origin }, body: new URLSearchParams({ assignment: context, returnTo: indentPath }) });
  const manager = 'Jayant.' + roleKey('Project Manager');
  assert.equal((await switchTo('i', manager)).status, 303);
  assert.equal((await switchTo('m', 'Jayant.' + roleKey('Procurement Executive'))).status, 403);
  assert.equal((await switchTo('m', 'Sasti.' + roleKey('Project Manager'))).status, 403);
  assert.doesNotMatch(await (await request('/entries/approvals', 'i', { context: manager })).text(), new RegExp(indentPath));
  assert.equal((await write(indent, 'i', 'Jayant', 'Project Manager', { action: 'Approve', rev: 1 }, manager)).status, 422);
  assert.equal((await write(indent, 'm', 'Jayant', 'Project Manager', { action: 'Approve', rev: 1 })).status, 200);
  assert.doesNotMatch(await (await request('/entries/approvals', 'h')).text(), new RegExp(indentPath));
  const approvedIndent = await write(indent, 'h', 'Jayant', 'Head – Procurement', { action: 'Approve', rev: 2 });
  assert.equal((await approvedIndent.json()).status, 'Posted');

  const po = randomUUID();
  const purchase = { type: 'E2', action: 'Submit', rev: 0, day,
    data: { indent, type: 'Bulk', supplier: review.supplier, depot: review.depot, basis: 'Delivered', kl: 1, terms: 'Advance' } };
  assert.equal((await request('/entries/new/E2', 'm')).status, 403);
  assert.equal((await write(po, 'm', 'Jayant', 'Procurement Executive', purchase, 'Jayant.' + roleKey('Procurement Executive'))).status, 403);
  assert.equal((await write(po, 'p', 'Jayant', 'Procurement Executive', purchase)).status, 200);
  const approvedPo = await write(po, 'h', 'Jayant', 'Head – Procurement', { action: 'Approve', rev: 1 });
  assert.equal((await approvedPo.json()).status, 'Posted');
  profiles.h.dieselEntryAccess = [];
  assert.equal((await request('/entries/record/' + po, 'h')).status, 403);
});
