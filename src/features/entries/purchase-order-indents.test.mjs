import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { purchaseOrderIndents } from './purchase-order-indents.mjs';
import { filterOrderIndents } from './assets/purchase-order-indents.js';
import { openDieselDatabase } from '../../data/database.mjs';
import { createEntryStore } from './entry-store.mjs';
import { detailPage } from './entry-page.mjs';
import { roleKey, review } from './review-masters.mjs';
import { businessDay } from './entry-rules.mjs';

const day = businessDay();
const actor = { id: 'buyer', site: 'Jayant', selectedSite: 'Jayant', profile: roleKey('Procurement Executive'), requestedBy: 'Test Buyer' };
const doc = { id: 'current', type: 'E2', site: 'Jayant', day, rev: 0, data: {} };
const indent = (id, site = 'Jayant', status = 'Posted') => ({ id, type: 'E1', site, status, day, number: 'CMLL/JOC/IND/26-27/' + id,
  data: { remarks: 'Underground tank replenishment' }, result: { litres: 1000 } });
const order = (id, source, litres, status = 'Awaiting approval') => ({ id, type: 'E2', site: 'Jayant', status, day, data: { indent: source }, result: { litres } });

test('PO indent choices include only approved indents at the selected site, even under the same location', () => {
  const rows = [indent('001'), indent('002', 'Dudhichua OC'), indent('003', 'Sasti'), indent('004', 'Jayant', 'Saved'),
    indent('005', 'Jayant', 'Awaiting approval'), indent('006', 'Jayant', 'Returned'), indent('007', 'Jayant', 'Draft'),
    { ...indent('008'), day: '2099-01-01' }];
  assert.deepEqual(purchaseOrderIndents(doc, rows, actor).map(row => row.value), ['001']);
  assert.deepEqual(purchaseOrderIndents(doc, rows, { ...actor, selectedSite: '' }), []);
  assert.deepEqual(purchaseOrderIndents(doc, rows, { ...actor, selectedSite: 'Sasti' }), []);
});

test('available indent quantities reserve pending POs and exclude the PO being edited', () => {
  const rows = [indent('001'), indent('002'), order('reserved', '001', 250), order('full', '002', 1000),
    order('draft', '001', 800, 'Draft'), order('returned', '001', 800, 'Returned'), order(doc.id, '001', 100)];
  const choices = purchaseOrderIndents(doc, rows, actor);
  assert.deepEqual(choices.map(row => [row.value, row.litres, row.remaining]), [['001', 1000, 750]]);
});

test('indent smart search matches number fragments, words and available quantity', () => {
  const rows = purchaseOrderIndents(doc, [indent('018'), indent('022')], actor);
  assert.deepEqual(filterOrderIndents(rows, 'joc 018').map(row => row.value), ['018']);
  assert.equal(filterOrderIndents(rows, 'tank 1000').length, 2);
  assert.deepEqual(filterOrderIndents(rows, 'Sasti'), []);
  assert.equal(filterOrderIndents(rows, '').length, 2);
});

test('PO section order matches the cursor flow, with the employee display outside the form', t => {
  const db = openDieselDatabase(':memory:'); t.after(() => db.close());
  const store = createEntryStore(db), draft = store.fresh('E2', actor);
  const html = detailPage(actor, draft, [], [], null, store.definition('E2', actor.site));
  const sections = ['Purchase Order Details', '>Indent</span>', 'Vendor Details', 'Material Details', 'Final Calculation – Footer / Tax',
    'Tax &amp; Supply', 'Freight &amp; Logistics', 'Tolerance &amp; Shortage', '>Payment</span>', 'value="Submit">Save PO'];
  let previous = html.indexOf('<form id="entry-form"');
  for (const section of sections) {
    const at = html.indexOf(section, previous); assert.ok(at > previous, section); previous = at;
  }
  assert.ok(html.indexOf('class="po-employee"') < html.indexOf('<form id="entry-form"'));
  assert.match(html, /<strong>Test Buyer<\/strong>/);
  assert.doesNotMatch(html, /Undersigned \(Employee\)|Unassigned employee/);
  assert.match(html, /name="undersigned" type="hidden" value="Test Buyer"/);
});

test('the save rules reject a forged indent from another site or one awaiting approval', t => {
  const db = openDieselDatabase(':memory:'); t.after(() => db.close());
  const store = createEntryStore(db);
  const make = site => store.write(randomUUID(), { site, id: site + '-maker', profile: roleKey('Site In-charge') },
    { type: 'E1', action: 'Save indent', rev: 0, day, data: { litres: 1000, requiredBy: 0 } });
  const other = make('Sasti'), waiting = make('Jayant');
  store.approveIndent(other.id, { sanctioned: 1000, by: 'Approver' });
  for (const id of [other.id, waiting.id]) assert.throws(() => store.write(randomUUID(), actor,
    { type: 'E2', action: 'Submit', rev: 0, day, data: { indent: id, type: 'Bulk', supplier: review.supplier,
      depot: review.depot, basis: 'Delivered', kl: 1, terms: 'Credit' } }), /posted|approved|source|unavailable/i);
});
