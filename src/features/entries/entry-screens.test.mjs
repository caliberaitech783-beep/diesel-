import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { approvalCard, entryChecks } from './approval-inbox.mjs';
import { approvalsPage, detailPage, roleHomePage } from './entry-page.mjs';
import { byId } from './catalog.mjs';
import { roleKey } from './review-masters.mjs';

const day = '2026-11-20';
const manager = { id: 'pm', site: 'Jayant', profile: roleKey('Project Manager'), businessDay: day };
const waiting = {
  id: '11111111-1111-4111-8111-111111111111', type: 'E6', site: 'Jayant', maker: 'store', day, rev: 3, stage: 1,
  status: 'Awaiting approval', number: 'E6-0001',
  data: { density: 830, decision: 'Accept part, reject part', rejected: 200, reason: 'Water found',
    evidence: [{ id: 'f1', name: 'dip.jpg' }, { id: 'f2', name: 'note.pdf' }] },
  result: { approvals: ['Site In-charge', 'Project Manager'], shortage: 12.5, rejected: 200, aboveStandard: true, generateGRN: true },
};

test('approval checks list rule overrides, variances and the maker reason', () => {
  assert.deepEqual(entryChecks(waiting), [
    ['Above Standard', 'alert'], ['Shortage · 12.5', 'warn'], ['Rejected · 200', 'warn'], ['Reason · Water found', 'warn'],
  ]);
  assert.deepEqual(entryChecks({ ...waiting, data: {}, result: { approvals: [] } }), []);
});

test('approvals inbox shows each waiting entry with photos and inline approve or return', () => {
  const card = approvalCard(waiting, [waiting]);
  assert.match(card, /Step 2 of 2 · Project Manager/);
  assert.match(card, /<img src="\/entries\/file\/f1" alt="dip\.jpg"/);
  assert.match(card, /<a href="\/entries\/file\/f2">note\.pdf<\/a>/);
  assert.match(card, /value="Approve">Approve<\/button><button value="Return">Return/);
  assert.match(card, /data-rev="3"/);
  const page = approvalsPage(manager, [waiting, { ...waiting, id: 'x', stage: 0 }]);
  assert.match(page, /1 waiting for you as Project Manager/);
  assert.match(page, /approval-inbox\.js/);
  assert.match(approvalsPage(manager, []), /Nothing is waiting for your approval/);
});

test('role home shows shift, stock and today, with waiting approvals as the biggest tile', () => {
  const stock = { 'Tank and bowser stock (L)': 18250, 'Days of stock': 4.26, 'In transit (L)': 6000 };
  const html = roleHomePage(manager, [waiting], [], { shift: 'Day shift', stock });
  assert.match(html, /<strong>Day shift<\/strong>/);
  assert.match(html, /<strong>18,250 L<\/strong><small>4\.3 days of stock · 6,000 L in transit<\/small>/);
  assert.match(html, /<strong>1 entry<\/strong><small>0 posted · 1 awaiting approval<\/small>/);
  assert.match(html, /<a class="lead" href="\/entries\/approvals">My approvals \(1\)<\/a>/);
  const quiet = roleHomePage({ ...manager, profile: roleKey('Site Store') }, [], []);
  assert.match(quiet, /No shift set/);
  assert.match(quiet, /Not set up/);
  const unknown = roleHomePage(manager, [], [], { stock: { 'Tank and bowser stock (L)': 2500, 'Days of stock': null } });
  assert.match(unknown, /<strong>2,500 L<\/strong><\/div>/);
  assert.match(quiet, /<a class="lead" href="\/entries\/new\//);
});

test('entry forms mark required fields for the field colours', () => {
  const store = { id: 'store', site: 'Jayant', profile: roleKey('Site Store'), businessDay: day };
  const draft = { id: waiting.id, type: 'E6', site: 'Jayant', maker: 'store', day, rev: 0, status: 'Draft', number: '', data: {}, result: {}, stage: 0 };
  const html = detailPage(store, draft, [], [], null, byId.E6);
  assert.match(html, /name="density" type="number" data-required="true"/);
  assert.doesNotMatch(html, /name="rejected" type="number" data-required/);
  assert.match(html, /field-states\.js/);
});

test('field entries stamp GPS automatically and offer a camera scan for tags', () => {
  const operator = { id: 'op', site: 'Jayant', profile: roleKey('Point operator'), businessDay: day };
  const draft = { id: waiting.id, type: 'E10A', site: 'Jayant', maker: 'op', day, rev: 0, status: 'Draft', number: '', data: {}, result: {}, stage: 0 };
  const html = detailPage(operator, draft, [], [], null, byId.E10A);
  assert.match(html, /<output id="gps-status"[^>]*>GPS is stamped automatically/);
  assert.match(html, /<button type="button" id="scan-camera" hidden>Scan with camera<\/button><video id="scan-video" playsinline muted hidden>/);
  assert.match(html, /phone-capture\.js/);
});

test('entry page scripts share one global scope without clashing names', () => {
  // Classic scripts on one page share top-level const/let names, so a repeat stops the later script loading.
  const scripts = ['entry-form.js', 'entry-language.js', 'field-states.js', 'approval-inbox.js', 'remote-approval.js', 'phone-capture.js'];
  const seen = new Map();
  for (const name of scripts) {
    const source = readFileSync(new URL('./assets/' + name, import.meta.url), 'utf8');
    for (const [, id] of source.matchAll(/^(?:const|let|class|function|async function)\s+([A-Za-z_$][\w$]*)/gm)) {
      assert.ok(!seen.has(id), id + ' is declared in both ' + seen.get(id) + ' and ' + name);
      seen.set(id, name);
    }
  }
});
