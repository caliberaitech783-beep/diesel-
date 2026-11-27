import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { createCheckNotes, withDecisions } from './check-notes.mjs';
import { insightsPage } from './insights-page.mjs';

const findings = [
  { title: 'Storage locations with no capacity', help: 'Stock limits cannot be checked without a capacity.', group: 'Storage', master: ['Storage Location Master', '/master-data?master=storage-location-master'],
    items: ['J-COAL · JAYANT COAL SITE', 'SCS · SASTI CAMP STORAGE'], refs: [{ href: '/master-data?master=storage-location-master&q=J-COAL', site: 'Jayant OC' }, { href: '/master-data?master=storage-location-master&q=SCS', site: 'Sasti OC' }], count: 2 },
  { title: 'Shifts for a site that is not in the Location Master', help: 'Correct the site on the shift in Pulse.', group: 'Shifts', master: ['Shift Master', '/pulse-masters?master=shift'], items: [], refs: [], count: 0 },
];

test('a finding marked not a problem stops counting until it is brought back, and each day keeps its total', () => {
  const notes = createCheckNotes(new DatabaseSync(':memory:'));
  assert.equal(withDecisions(findings, notes.accepted())[0].count, 2);
  notes.accept(findings[0].title, 'J-COAL · JAYANT COAL SITE', 'Asha');
  notes.accept(findings[0].title, 'J-COAL · JAYANT COAL SITE', 'Someone else');
  const decided = withDecisions(findings, notes.accepted());
  assert.deepEqual([decided[0].count, decided[0].open.map(row => row.text), decided[0].accepted.map(row => [row.text, row.by, row.site])],
    [1, ['SCS · SASTI CAMP STORAGE'], [['J-COAL · JAYANT COAL SITE', 'Asha', 'Jayant OC']]]);
  notes.restore(findings[0].title, 'J-COAL · JAYANT COAL SITE');
  assert.equal(withDecisions(findings, notes.accepted())[0].count, 2);

  assert.equal(notes.record('2026-11-20', 1500), null, 'the first day has nothing before it');
  assert.deepEqual({ ...notes.record('2026-11-27', 1442) }, { day: '2026-11-20', total: 1500 });
  assert.deepEqual({ ...notes.record('2026-11-27', 1440) }, { day: '2026-11-20', total: 1500 }, 'a second look on the same day replaces that day, not the comparison');
});

test('Data overview shows the change, the decision buttons, accepted findings and the site filter', () => {
  const notes = createCheckNotes(new DatabaseSync(':memory:'));
  notes.accept(findings[0].title, 'J-COAL · JAYANT COAL SITE', 'Asha');
  const html = insightsPage({ actor: { name: 'Asha' }, view: 'checks', masterDataPath: '/master-data', findings: withDecisions(findings, notes.accepted()),
    before: { day: '2026-11-20', total: 59 }, decisions: true, progress: [{ slug: 'account-master', name: 'Account Master', count: 165, incomplete: 5 }] });
  assert.match(html, /<a class="check-tile better" href="#check-0"><strong>1<\/strong><span>Record to correct<\/span><small>58 fewer than on 20 Nov 2026<\/small><\/a>/);
  assert.match(html, /1 accepted as not a problem\./);
  assert.match(html, /<form method="post" action="\/master-insights\/decision"><input type="hidden" name="check" value="Storage locations with no capacity"><input type="hidden" name="item" value="SCS · SASTI CAMP STORAGE">\s*<button name="action" value="accept"[^>]*>Not a problem<\/button>/);
  assert.match(html, /<details class="check-accepted"><summary>Accepted as not a problem \(1\)<\/summary>[\s\S]*?<small>Accepted by Asha<\/small>[\s\S]*?<button name="action" value="restore"[^>]*>Bring back<\/button>/);
  assert.match(html, /<select id="check-site"><option value="">All sites<\/option><option>Sasti OC<\/option><\/select>/);
  assert.match(html, /<span>160 of 165<\/span>\s*<progress max="165" value="160">97%<\/progress>/);
  assert.match(html, /<ul class="check-clear"><li><span aria-hidden="true">✓<\/span>Shifts for a site that is not in the Location Master<\/li>/);
  // Without the shared database there are no decision buttons, and nothing else changes.
  assert.ok(!insightsPage({ actor: { name: 'A' }, view: 'checks', masterDataPath: '/master-data', findings: withDecisions(findings) }).includes('/master-insights/decision'));
});
