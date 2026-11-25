import assert from 'node:assert/strict';
import test from 'node:test';
import { createLiveRefresh } from './assets/live-refresh.mjs';
import { masterDataPage } from './page.mjs';
import { recordsPage } from '../masters/records-page.mjs';
import { masterDefinition, recordMasters } from '../masters/records-fields.mjs';
import { pulseMasterPage } from '../pulse-masters/pulse-master-page.mjs';
import { pulseMasters } from '../pulse-masters/pulse-master-catalog.mjs';

test('registers refresh repeatedly, skip hidden tabs, retry failures and never overlap', async () => {
  let timer, delay, loads = 0, visible = true, failure = false, release;
  const applied = [], errors = [];
  const live = createLiveRefresh({
    schedule(fn, ms) { timer = fn; delay = ms; return 1; },
    cancel() { timer = undefined; },
    visible: () => visible,
    async load() { loads++; if (release) await release.promise; if (failure) throw new Error('Offline'); return loads; },
    apply: page => applied.push(page), onError: error => errors.push(error.message),
  });
  assert.equal(delay, 30_000);
  assert.equal(loads, 0, 'the initial server-rendered page is already fresh');
  await timer();
  assert.deepEqual(applied, [1]);
  visible = false;
  await timer();
  assert.equal(loads, 1);
  visible = true;
  failure = true;
  await live.refresh();
  assert.deepEqual(errors, ['Offline']);
  failure = false;
  await timer();
  assert.deepEqual(applied, [1, 3]);
  release = Promise.withResolvers();
  const pending = live.refresh();
  await live.refresh();
  assert.equal(loads, 4);
  release.resolve();
  await pending;
  assert.deepEqual(applied, [1, 3, 4]);
  live.stop();
  assert.equal(timer, undefined);
  await live.refresh();
  assert.equal(loads, 4);
});

test('a response after leaving the page cannot update its records', async () => {
  const gate = Promise.withResolvers();
  let applied = false;
  const live = createLiveRefresh({
    schedule() {}, cancel() {}, visible: () => true,
    load: () => gate.promise, apply() { applied = true; }, onError() {},
  });
  const pending = live.refresh();
  live.stop();
  gate.resolve('old page');
  await pending;
  assert.equal(applied, false);
});

test('every saved master and review register updates live while record forms keep their drafts', () => {
  const actor = { id: 'maker', name: 'Maker', site: 'Sasti', canEditMasters: true, masterSites: [{ site: 'Sasti' }] };
  for (const slug of recordMasters) {
    const master = masterDefinition(slug);
    const page = masterDataPage({ actor, master, canSave: true, rows: [], offset: 0, pageSize: 50,
      prefix: '/masters-workspace' });
    assert.match(page, /live-records.js/);
    assert.doesNotMatch(page, /data-live-status|>Live</);
    assert.match(page, /<aside class="sidebar" id="masters-sidebar" hidden>/, 'the menu is on the page but starts hidden');
    assert.match(page, /<h1[^>]*>[^<]+<\/h1>\s*<form class="master-data-search"/);
    assert.match(page, /data-live-records data-live-scope="[a-f0-9]{64}"/);
    const register = recordsPage({ actor, master, rows: [], offset: 0, limit: 50, search: '', status: '',
      masterSelected: true, editingAllowed: true, prefix: '/masters-workspace' });
    assert.match(register, /live-records.js/);
    assert.doesNotMatch(register, /data-live-status|>Live</);
    const form = recordsPage({ actor, master, rows: [], creating: true, editingAllowed: true, prefix: '/masters-workspace' });
    assert.doesNotMatch(form, /live-records.js|data-live-records/);
  }
  const otherActor = { ...actor, id: 'another' };
  const options = { master: masterDefinition('item-master'), canSave: true, rows: [], offset: 0, pageSize: 50 };
  const scope = actor => masterDataPage({ ...options, actor }).match(/data-live-scope="([a-f0-9]+)"/)[1];
  assert.notEqual(scope(actor), scope(otherActor), 'another account cannot replace the open table');
  assert.notEqual(scope(actor), scope({ ...actor, site: 'Other site' }), 'another site cannot replace the open table');
  for (const master of pulseMasters) {
    const page = pulseMasterPage({ actor, master, rows: [], total: 0, offset: 0, pageSize: 50, masterDataPath: '/master-data' });
    assert.match(page, /<aside class="sidebar" id="masters-sidebar" hidden>/);
    assert.equal([...page.slice(page.indexOf('<main')).matchAll(/type="search"/g)].length, 1);
    assert.match(page, /href="\/master-data" aria-label="Back to Master Data"[^>]*>\s*<svg/);
  }
});
