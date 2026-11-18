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
    const guestPage = await page.text();
    assert.match(guestPage, /data-access-mode="guest"/);
    assert.match(guestPage, /<h1[^>]*>Item Master<\/h1>/);
    assert.doesNotMatch(guestPage, /Form preview|Use sample details/);
    const rate = await fetch(base + '/?master=diesel-rate-master');
    assert.match(await rate.text(), /data-field-key="invoice-rate"/);
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
    assert.match(await (await request('/')).text(), /Sign in with Pulse/);
    const start = await request('/api/sign-in/start');
    assert.equal(start.status, 303);
    started = new URL(start.headers.get('location'));
    assert.equal(started.pathname, '/api/diesel-sso/authorize');
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

    const signOut = headers => request('/api/sign-out', { method: 'POST', headers: { Cookie, ...headers } });
    assert.equal((await signOut({ Origin: 'https://other.test' })).status, 403);
    assert.equal((await signOut({ Origin: origin })).status, 303);
    assert.equal((await request('/', { headers: { Cookie } })).status, 401);
    assert.equal((await request('/healthz')).status, 200);
  } finally {
    server.close();
  }
});
