import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { pickRate, ratesFor } from './assets/purchase-order-rates.js';
import { dieselRateRows } from './diesel-rates.mjs';
import { purchaseOrderTotals } from './assets/purchase-order-totals.js';
import { purchaseOrderExportRows } from './entry-register.mjs';
import { openDieselDatabase } from '../../data/database.mjs';
import { createEntryStore } from './entry-store.mjs';
import { review, roleKey } from './review-masters.mjs';
import { byId } from './catalog.mjs';
import { businessDay } from './entry-rules.mjs';
import { detailPage } from './entry-page.mjs';

const record = values => ({ status: 'saved', values: { 'Price basis (EXMI / Delivered)': 'EXMI', ...values } });
const master = dieselRateRows([
  record({ Location: 'CMPL Madhya Pradesh', Supplier: 'RELIANCE INDUSTRIES LTD(BG)', Depot: 'HAJIRA', 'Effective from': '2026-11-25', 'Basic rate (₹/Ltr)': '111.43412',
    'Diesel rate (₹/Ltr), worked out': '137', 'Freight rate (₹/Ltr)': '2.5', 'Gross landed cost (₹/Ltr)': '139.5', 'Net landed cost (₹/Ltr)': '115.1' }),
  // Saved before the field was renamed.
  record({ Location: 'CMPL Madhya Pradesh', Supplier: 'RELIANCE INDUSTRIES LTD(BG)', Depot: 'JAMNAGAR', 'Effective from': '2026-11-25',
    'Diesel rate (₹/Ltr), worked out': '137.2', 'Transportation rate (₹/Ltr)': '3', 'Gross landed cost (₹/Ltr)': '140.2' }),
  record({ Location: 'CMPL Nagpur', Supplier: 'ANGEL LOGISTICS', Depot: '25', 'Effective from': '2026-11-03', 'Effective to': '2026-11-11', 'Diesel rate (₹/Ltr), worked out': '1206.7' }),
  { status: 'deleted', values: { Supplier: 'GONE', 'Diesel rate (₹/Ltr), worked out': '1' } },
]);

test('a purchase order takes its rates from the Diesel Rate Master record for the vendor, location, date and depot', () => {
  assert.equal(master.length, 3);
  assert.equal(master[1].freight, 3, 'a rate saved as Transportation rate is read as the freight rate');
  const ask = more => pickRate(master, { supplier: 'RELIANCE INDUSTRIES LTD(BG)', location: 'CMPL Madhya Pradesh', day: '2026-11-27', ...more });

  const unsure = ask({});
  assert.equal(unsure.rate, null);
  assert.match(unsure.reason, /HAJIRA and JAMNAGAR.*Lifting Location/);
  const hajira = ask({ depot: 'hajira' }).rate;
  assert.deepEqual(ratesFor(hajira), { netRate: 111.43412, freightRate: 2.5, freightDeductionRate: 137, landedRate: 139.5 });
  assert.equal(ratesFor(hajira, { gross: false }).landedRate, 115.1);
  // No net landed cost on the record: the gross one stands in.
  assert.equal(ratesFor(ask({ depot: 'Reliance Jamnagar terminal' }).rate, { gross: false }).landedRate, 140.2);

  assert.match(ask({ depot: 'HAJIRA', day: '2026-11-20' }).reason, /valid on the PO date/);
  assert.match(pickRate(master, { supplier: 'ANGEL LOGISTICS', location: 'CMPL Nagpur', day: '2026-11-27' }).reason, /valid on the PO date/);
  assert.equal(pickRate(master, { supplier: 'ANGEL LOGISTICS', location: 'CMPL Nagpur', day: '2026-11-05' }).rate.diesel, 1206.7);
  assert.match(pickRate(master, { supplier: 'ANGEL LOGISTICS', location: 'CMPL Madhya Pradesh', day: '2026-11-05' }).reason, /at CMPL Madhya Pradesh/);
  assert.match(pickRate(master, { supplier: 'SOMEONE ELSE', day: '2026-11-27' }).reason, /No rate in Diesel Rate Master for this vendor/);
  assert.deepEqual(pickRate(master, {}), { rate: null, reason: '' });
  assert.equal(ratesFor(null), null);
});

test('the order form has one Net Rate, saves without a rate before discount and shows the fetched landed rate', t => {
  assert.equal(purchaseOrderTotals({ litres: 1000, rateAfter: 137, landedRate: 139.5 }).landedRate, 139.5);
  assert.equal(purchaseOrderTotals({ litres: 1000, rateAfter: 137, basis: 'Ex-depot', freightRate: 2 }).landedRate, 139, 'worked out when none is fetched');

  const db = openDieselDatabase(':memory:'); t.after(() => db.close());
  const store = createEntryStore(db), day = businessDay();
  const actor = role => ({ site: 'Jayant', profile: roleKey(role), id: 'Jayant-' + roleKey(role), name: role });
  let indent = store.write(randomUUID(), actor(byId.E1.maker), { type: 'E1', rev: 0, day, action: 'Submit', data: { litres: 5000, requiredBy: 0, reason: review.reasons[0] } });
  while (indent.status === 'Awaiting approval') indent = store.write(indent.id, actor(indent.result.approvals[indent.stage]), { action: 'Approve', rev: indent.rev });
  const data = { indent: indent.id, supplier: review.supplier, depot: review.depot, basis: 'Delivered', terms: 'Credit', undersigned: 'Buyer', transactionType: 'Inter State',
    supplyNature: 'Non-GST Supplies', loadingOnGross: 'Yes', litres: 1000, rateAfter: 137, landedRate: 139.5, freightRate: 2.5, tolerance: 0, shortageFrom: 'Vendor', shortageMethod: 'Fixed', freightDeductionRate: 137 };
  const buyer = { ...actor(byId.E2.maker), dieselRates: master };
  const order = store.write(randomUUID(), buyer, { type: 'E2', rev: 0, day, action: 'Submit', data });
  assert.equal(order.result.value, 137000);
  assert.equal(order.result.landedRate, 139.5);
  assert.equal(order.result.invoiceDiscount, 0);
  assert.throws(() => store.write(randomUUID(), buyer, { type: 'E2', rev: 0, day, action: 'Submit', data: { ...data, rateAfter: undefined } }), /Enter the Net Rate/);

  const form = detailPage(buyer, store.fresh('E2', buyer), store.list('Jayant'), [], null);
  assert.match(form, /<th>Net Rate<b class="req" aria-hidden="true">\*<\/b><\/th><th>Amount<\/th><th>Landed Rate<\/th><th>GRN No\.<\/th>/);
  assert.match(form, /name="rateAfter"[^>]*aria-label="Net Rate"/);
  assert.match(form, /<input type="hidden" name="landedRate" value="">/);
  assert.match(form, /data-rate-note data-rates="\[\{[^"]*HAJIRA[^"]*" data-location="CMPL Madhya Pradesh" hidden>/);
  for (const gone of ['rateBefore', 'Rate Before Disc.', 'Rate After Disc.', 'Material In No.']) assert.ok(!form.includes(gone), gone + ' is off the form');

  const sheet = purchaseOrderExportRows([order], store.list('Jayant'));
  assert.ok(sheet[0].includes('Net Rate') && !sheet[0].includes('Rate Before Disc.') && !sheet[0].includes('Rate After Disc.'));
  assert.equal(sheet[1][sheet[0].indexOf('Net Rate')], 137);
  assert.equal(sheet[1][sheet[0].indexOf('Landed Rate (per Litre)')], 139.5);
});
