import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { masterDefinition, recordMasters } from './records-fields.mjs';
import { recordsPage } from './records-page.mjs';
import { openItemSubmissions } from './item-submissions.mjs';
import { itemSiteGroups } from './item-site-options.mjs';
import { draftKey, readDraft } from './assets/record-drafts.mjs';

const actor = { id: 'layout-maker', name: 'Layout maker', site: 'Jayant' };
const page = slug => recordsPage({ master: masterDefinition(slug), actor, creating: true, editingAllowed: true,
  rows: [], search: '', status: '', masterSelected: true, submissionsOnly: true, revisions: [] });

test('the new editor is limited to Item Master and preserves production file and dialog controls', () => {
  const item = page('item-master');
  assert.match(item, /item-records\.css/);
  assert.match(item, /data-save-for-review/);
  assert.match(item, /data-private-submission="true"/);
  assert.match(item, /data-write-scope="[a-f0-9]{64}"/);
  assert.match(item, /data-import-scope="[a-f0-9]{64}"/);
  assert.match(item, /data-record-site required[^>]*><option value="">Select site<\/option>/);
  assert.doesNotMatch(item, /editor-context|Site · Jayant/);
  for (const site of itemSiteGroups.flatMap(group => group.sites)) assert.ok(item.includes('>' + site + '</option>'), site);
  for (const slug of recordMasters.filter(slug => slug !== 'item-master')) {
    assert.doesNotMatch(page(slug), /item-records\.css|class="master-editor"|data-record-site|Save local draft/, slug);
  }
});

test('the selected Item Master site survives saving, editing, history and reopening the store', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'diesel-item-layout-'));
  t.after(async () => { assert.equal(dirname(directory), resolve(tmpdir())); await rm(directory, { recursive: true, force: true }); });
  const values = Object.fromEntries(masterDefinition('item-master').fields.filter(field => field.required).map(field =>
    [field.key, field.options?.[0] ?? (field.type === 'number' ? '820' : 'Sample')]));
  Object.assign(values, { 'Item Code': 'LAYOUT-SITE', 'Item Name': 'Layout site test', Status: 'Active' });
  const store = await openItemSubmissions(directory);
  await assert.rejects(store.create(actor, 'item-master', values, ''), /Choose a listed WCL or NCL site/);
  await assert.rejects(store.create(actor, 'item-master', values, 'Unknown mine'), /Choose a listed WCL or NCL site/);
  const created = await store.create(actor, 'item-master', values, 'Dudhichua East OC');
  assert.equal(created.site, 'Dudhichua East OC');
  const reopened = await (await openItemSubmissions(directory)).get(actor, 'item-master', created.id);
  assert.equal(reopened.site, 'Dudhichua East OC');
  const edited = await store.update(actor, 'item-master', created.id, { revision: 1, values, site: 'Majri OC', reason: 'Correct selected site' });
  assert.equal(edited.site, 'Majri OC');
  assert.equal(edited.changes[0].snapshot.site, 'Dudhichua East OC');
  assert.equal(edited.changes[1].snapshot.site, 'Majri OC');
  await assert.rejects(store.update({ ...actor, id: 'other-login' }, 'item-master', created.id, { revision: 2, values, site: 'Sasti OC', reason: 'Not the owner' }), /Only the person who saved/);
});

test('local drafts are isolated by account and chosen site and cannot replace a newer revision', () => {
  const scope = { actor: actor.id, site: 'Jayant OC', slug: 'item-master', record: 'record-1' };
  assert.notEqual(draftKey(scope), draftKey({ ...scope, site: 'Majri OC' }));
  assert.notEqual(draftKey(scope), draftKey({ ...scope, actor: 'other-login' }));
  const draft = JSON.stringify({ version: 1, revision: '1', savedAt: '2026-11-21T07:00:00Z', values: { 'Item Code': 'D1' }, files: [] });
  assert.equal(readDraft(draft, '1').stale, false);
  assert.equal(readDraft(draft, '2').stale, true);
  assert.throws(() => readDraft('{"version":1,"values":[]}', '1'));
});
