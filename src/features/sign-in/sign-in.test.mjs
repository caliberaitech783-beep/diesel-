import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import test from 'node:test';
import { createApp } from '../../server.mjs';

test('Diesel opens as a guest without issuing a session or contacting Pulse', async () => {
  const app = createApp({
    env: { DIESEL_SSO_CLIENT_SECRET: 's'.repeat(43) },
    fetcher() {
      assert.fail('Guest access must not contact Pulse');
    },
  });
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const base = 'http://127.0.0.1:' + server.address().port;
    const page = await fetch(base, { headers: { Cookie: 'diesel_session=' + 'g'.repeat(43) } });
    assert.equal(page.status, 200);
    assert.equal(page.headers.get('referrer-policy'),'same-origin');
    const guestPage = await page.text();
    assert.match(guestPage, /data-access-mode="guest"/);
    assert.match(guestPage, /<h1[^>]*>Choose a master<\/h1>/);
    assert.doesNotMatch(guestPage, /class="master-form"/);
    assert.doesNotMatch(guestPage, /Form preview|Use sample details/);
    const rate = await fetch(base + '/?master=diesel-rate-master');
    assert.match(await rate.text(), /data-field-key="worked-out-rate"/);
    for (const endpoint of ['/workspace', '/entries', '/records', '/api/masters/item-master/records']) {
      assert.equal((await fetch(base + endpoint)).status, 404);
    }
    assert.equal(page.headers.get('set-cookie'), null);

    const start = await fetch(base + '/api/sign-in/start', { redirect: 'manual' });
    assert.equal(start.status, 303);
    assert.equal(start.headers.get('location'), '/');
    assert.equal(start.headers.get('set-cookie'), null);
  } finally {
    server.close();
  }
});

test('Pulse authorization creates a Diesel session, rejects cross-browser callbacks and revokes on sign-out', async () => {
  const secret = 's'.repeat(43);
  const grant = 'g'.repeat(43);
  const code = 'c'.repeat(43);
  const origin = 'https://diesel.test';
  let started, exchanged, revoked;
  const app = createApp({
    env: {
      DIESEL_ACCESS_MODE: 'pulse',
      DIESEL_ALLOWED_PULSE_LOGINS: ' Test , another ',
      DIESEL_PUBLIC_ORIGIN: origin,
      PULSE_ORIGIN: 'https://pulse.test',
      DIESEL_SSO_CLIENT_SECRET: secret,
    },
    async fetcher(url, options) {
      assert.equal(url.origin, 'https://pulse.test');
      assert.equal(options.headers.Authorization, 'Bearer ' + secret);
      const data = JSON.parse(options.body);
      if (url.pathname.endsWith('/exchange')) {
        assert.equal(data.code, code);
        assert.equal(data.state, started.searchParams.get('state'));
        assert.equal(createHash('sha256').update(data.verifier).digest('base64url'), started.searchParams.get('code_challenge'));
        exchanged = true;
        return Response.json({ grant });
      }
      assert.equal(data.grant, grant);
      if (url.pathname.endsWith('/validate')) {
        return revoked ? new Response(null, { status: 401 })
          : Response.json({ profile: { login: 'test', name: '<Operator>' } });
      }
      assert.ok(url.pathname.endsWith('/revoke'));
      revoked = true;
      return new Response(null, { status: 204 });
    },
  });
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const base = 'http://127.0.0.1:' + server.address().port;
    const request = (path, options) => fetch(base + path, { redirect: 'manual', ...options });
    const start = await request('/');
    assert.equal(start.status, 303);
    started = new URL(start.headers.get('location'));
    assert.equal(started.origin, 'https://pulse.test');
    assert.equal(started.pathname, '/');
    assert.equal(started.searchParams.get('dieselSignIn'), '1');
    const stateHeader = start.headers.get('set-cookie');
    assert.match(stateHeader, /^__Host-diesel_state=.*HttpOnly; Secure; SameSite=Lax/);
    const stateCookie = stateHeader.split(';', 1)[0];
    const query = new URLSearchParams({ code, state: started.searchParams.get('state') });
    const callback = '/api/sign-in/callback?' + query;
    assert.equal((await request(callback)).status, 400);
    assert.equal(exchanged, undefined);
    const finish = await request(callback, { headers: { Cookie: stateCookie } });
    assert.equal(finish.status, 303);
    assert.equal(finish.headers.get('location'), '/');
    const sessionHeader = finish.headers.getSetCookie().find(header => header.startsWith('__Host-diesel_session='));
    assert.match(sessionHeader, /HttpOnly; Secure; SameSite=Lax/);
    const Cookie = sessionHeader.split(';', 1)[0];
    const profile = await request('/?master=shift-master', { headers: { Cookie } });
    const profilePage = await profile.text();
    assert.match(profilePage, /Signed in as &lt;Operator&gt;/);
    assert.match(profilePage, /<h1[^>]*>Shift Master<\/h1>/);
    assert.doesNotMatch(profilePage, /Form preview|Use sample details/);

    const catalog = await (await request('/', { headers: { Cookie } })).text();
    const loginPath = catalog.match(/href="([^"]+)" aria-label="Back to login"/)?.[1];
    assert.equal(loginPath, '/login');
    const login = await request(loginPath, { headers: { Cookie } });
    assert.equal(login.status, 303);
    assert.equal(login.headers.get('location'), 'https://pulse.test/?login=1');
    assert.equal(login.headers.get('set-cookie'), null);

    const signOut = headers => request('/api/sign-out', { method: 'POST', headers: { Cookie, ...headers } });
    assert.equal((await signOut({ Origin: 'https://other.test' })).status, 403);
    assert.equal((await signOut({ Origin: origin })).status, 303);
    assert.equal((await request('/', { headers: { Cookie } })).status, 303);
    assert.equal((await request('/healthz')).status, 200);
  } finally {
    server.close();
  }
});

test('Azure requires Pulse and denies direct master access outside the explicit username list', async t => {
  for (const logins of ['', 'different, test2']) {
    const app = createApp({
      env: { WEBSITE_SITE_NAME: 'diesel', DIESEL_ACCESS_MODE: 'guest', DIESEL_ALLOWED_PULSE_LOGINS: logins, DIESEL_PULSE_ACCESS: 'listed', DIESEL_SSO_CLIENT_SECRET: 's'.repeat(43) },
      fetcher: async () => Response.json({ profile: { login: 'test', name: 'different' } }),
    });
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => server.close());
    const url = 'http://127.0.0.1:' + server.address().port + '/?master=driver-master';
    const anonymous = await fetch(url, { redirect: 'manual' });
    assert.equal(anonymous.status, 303);
    const signIn = new URL(anonymous.headers.get('location'));
    assert.equal(signIn.pathname, '/');
    assert.equal(signIn.searchParams.get('dieselSignIn'), '1');
    const blocked = await fetch(url, { headers: { Cookie: 'diesel_session=' + 'g'.repeat(43) } });
    assert.equal(blocked.status, 403);
    assert.doesNotMatch(await blocked.text(), /master-list/);
  }
});

test('every signed-in Pulse user can open Diesel, and nobody can without a Pulse sign-in', async t => {
  let profile = { login: 'anyone', name: 'Any Pulse User' };
  const app = createApp({
    env: { WEBSITE_SITE_NAME: 'diesel', DIESEL_ALLOWED_PULSE_LOGINS: '', DIESEL_SSO_CLIENT_SECRET: 's'.repeat(43) },
    fetcher: async () => profile ? Response.json({ profile }) : new Response('', { status: 401 }),
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const url = 'http://127.0.0.1:' + server.address().port + '/';
  const signedIn = { headers: { Cookie: 'diesel_session=' + 'g'.repeat(43) }, redirect: 'manual' };
  assert.equal((await fetch(url, { redirect: 'manual' })).status, 303, 'a visitor without a session is sent to Pulse');
  const opened = await fetch(url, signedIn);
  assert.equal(opened.status, 200);
  assert.match(await opened.text(), /Any Pulse User/);
  profile = { login: '  ' };
  assert.equal((await fetch(url, signedIn)).status, 403, 'a profile without a login is not a Pulse user');
  profile = null;
  assert.equal((await fetch(url, signedIn)).status, 303, 'an ended Pulse session is sent to sign in again');
});
