import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createApp } from '../../server.mjs';

// Caliber One (owner, 28 Nov 2026) shows Pulse, Pulse-II, HR Pulse and Diesel as tabs of one installed
// window on pulse.cmll.in/one. Diesel pages may therefore be framed by Diesel itself and by
// pulse.cmll.in, and by no other site.
const allowed = "frame-ancestors 'self' https://pulse.cmll.in";

test('Diesel pages may be shown inside Caliber One on pulse.cmll.in and nowhere else', async t => {
  const server = createApp({ env: {} }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/healthz`);
  const ancestors = response.headers.get('content-security-policy').split(';').map(part => part.trim())
    .filter(part => part.startsWith('frame-ancestors'));
  assert.deepEqual(ancestors, [allowed]);
});

test('the master pages Diesel frames inside itself allow the same ancestors', async () => {
  // frame-ancestors checks every frame above a page, so a master dialog opened inside Diesel inside
  // Caliber One must allow pulse.cmll.in as well.
  for (const file of ['item-directory-routes.mjs', 'item-submission-routes.mjs', 'records-routes.mjs']) {
    const source = await readFile(new URL(`../masters/${file}`, import.meta.url), 'utf8');
    const ancestors = source.match(/frame-ancestors[^;"`]*/g);
    assert.deepEqual(ancestors, [allowed], file);
  }
});
