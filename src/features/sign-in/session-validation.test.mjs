import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionValidation } from './session-validation.mjs';

const grant = 'g'.repeat(43);
const verified = { profile: { login: 'maker', dieselMasterAccess: [{ site: 'Jayant', role: 'maker' }] } };

test('handlers in one request share one in-flight Pulse validation; later requests recheck', async () => {
  let calls = 0, finish;
  const sessions = createSessionValidation({ validate() {
    calls++;
    return new Promise(resolve => { finish = resolve; });
  } });
  const request = { method: 'GET' };
  const first = sessions.verify(request, grant);
  const second = sessions.verify(request, grant);
  assert.equal(first, second);
  await Promise.resolve();
  assert.equal(calls, 1);
  finish(verified);
  assert.equal(await first, verified);
  assert.equal(await sessions.verify(request, grant), verified);
  const next = sessions.verify({ method: 'GET' }, grant);
  await Promise.resolve();
  assert.equal(calls, 2);
  finish(null);
  assert.equal(await next, null, 'revocation is observed on the next request');
});

test('callback verification is reused only for the immediate page and expires after five seconds', async () => {
  let calls = 0, now = 0;
  const sessions = createSessionValidation({ now: () => now, validate: async () => { calls++; return null; } });
  sessions.remember(grant, verified);
  assert.equal(await sessions.verify({ method: 'GET' }, 'o'.repeat(43)), null, 'another grant cannot use the handoff');
  assert.equal(await sessions.verify({ method: 'GET' }, grant), verified);
  assert.equal(calls, 1);
  assert.equal(await sessions.verify({ method: 'GET' }, grant), null, 'the handoff is consumed');
  sessions.remember(grant, verified);
  now = 5000;
  assert.equal(await sessions.verify({ method: 'GET' }, grant), null, 'an expired handoff must recheck');
  assert.equal(calls, 3);
});

test('writes and sign-out discard handoffs; errors never fall back to a remembered session', async () => {
  let fail = false, calls = 0;
  const sessions = createSessionValidation({ validate: async () => {
    calls++;
    if (fail) throw new Error('Pulse unavailable');
    return null;
  } });
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    sessions.remember(grant, verified);
    assert.equal(await sessions.verify({ method }, grant), null);
    assert.equal(await sessions.verify({ method: 'GET' }, grant), null);
  }
  sessions.remember(grant, verified);
  sessions.forget(grant);
  fail = true;
  await assert.rejects(sessions.verify({ method: 'GET' }, grant), /Pulse unavailable/);
  assert.equal(calls, 9);
  assert.equal(sessions.verify({ method: 'GET' }, 'bad-cookie'), null);
});

test('one failed Pulse call is shared by a request without caching failure for another request', async () => {
  let calls = 0;
  const sessions = createSessionValidation({ validate: async () => {
    if (++calls === 1) throw new Error('Pulse unavailable');
    return verified;
  } });
  const request = { method: 'GET' };
  await assert.rejects(sessions.verify(request, grant), /Pulse unavailable/);
  await assert.rejects(sessions.verify(request, grant), /Pulse unavailable/);
  assert.equal(await sessions.verify({ method: 'GET' }, grant), verified);
  assert.equal(calls, 2);
});
