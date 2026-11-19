import assert from 'node:assert/strict';
import test from 'node:test';
import { accountDeduction } from './purchasing.mjs';
import { tdsRules } from './tds-deduction.mjs';

const row = (id, values) => ({ id, revision:1, values:{ 'Threshold: single payment (₹)':'0', 'Rate without PAN (%)':'5',
  'Effective from':'2026-04-01', 'Payee category':'Company', ...values } });
const rules = tdsRules([
  row('purchase',{ 'Tax Section Code':'194Q', 'Section of Income-tax Act':'194Q', 'Applies to (freight, diesel purchase)':'Diesel purchase',
    'Threshold: aggregate in the year (₹)':'5000000', 'Rate with PAN (%)':'0.1' }),
  row('freight',{ 'Tax Section Code':'194C', 'Section of Income-tax Act':'194C', 'Applies to (freight, diesel purchase)':'Freight',
    'Threshold: single payment (₹)':'30000', 'Threshold: aggregate in the year (₹)':'100000', 'Rate with PAN (%)':'2', 'Rate without PAN (%)':'20' }),
  row('unusable',{ 'Tax Section Code':'194X', 'Applies to (freight, diesel purchase)':'Rent', 'Threshold: aggregate in the year (₹)':'0', 'Rate with PAN (%)':'1' }),
]);
const supplier = { code:'SUP', tds:true, tdsNature:'194q', tdsPayee:'company', pan:true };
const carrier = { code:'LORRY', tds:true, tdsNature:'194C', tdsPayee:'Company', pan:true };
const posted = (type, day, result) => ({ id:type+day+JSON.stringify(result), type, status:'Posted', day, result });
const context = all => ({ all, doc:{ id:'current', day:'2026-11-19' }, siteConfig:{ tdsRules:rules } });

test('Tax Master (TDS) rows work out purchase and freight deductions from thresholds, PAN and the financial year', () => {
  assert.deepEqual(rules.map(rule => rule.id), ['purchase','freight']);
  const earlier = [posted('E3','2026-06-01',{ supplier:'SUP', amount:4900000, valueBeforeVat:4800000 }),
    posted('E3','2026-03-31',{ supplier:'SUP', amount:9000000 }), posted('E3','2026-06-02',{ supplier:'OTHER', amount:9000000 })];
  const purchase = accountDeduction(context(earlier),supplier,'purchase',1000000,1250000);
  assert.deepEqual([purchase.tdsBase,purchase.tdsRate,purchase.tds,purchase.tdsSection],[800000,0.1,800,'194Q']);
  assert.equal(accountDeduction(context([]),supplier,'purchase',1000000,1250000).tds,0);
  assert.equal(accountDeduction(context([]),{...supplier,tdsFromFirstDay:true},'purchase',1000000,1250000).tds,1000);
  assert.equal(accountDeduction(context([]),{...supplier,tdsFromFirstDay:true,pan:false},'purchase',1000000,1250000).tds,50000);

  assert.equal(accountDeduction(context([]),carrier,'freight',20000,20000).tds,0);
  assert.equal(accountDeduction(context([]),carrier,'freight',40000,40000).tds,800);
  const bills = [posted('E9','2026-05-01',{ party:'LORRY', freight:25000, tds:0 }), posted('E9','2026-07-01',{ party:'LORRY', freight:40000, tds:800 }),
    posted('E9','2026-08-01',{ party:'LORRY', freight:20000, tds:0 })];
  const crossing = accountDeduction(context(bills),carrier,'freight',20000,20000);
  assert.deepEqual([crossing.tdsBase,crossing.tds],[65000,1300]);
  assert.throws(() => accountDeduction(context(bills),{...carrier,pan:false},'freight',20000,10000),/exceeds this payment/);
});

test('an account without an approved rule keeps the Accounts-approved amount, and a rule refuses a typed amount', () => {
  const unmatched = { ...supplier, tdsNature:'Unlisted' };
  assert.deepEqual(accountDeduction(context([]),unmatched,'purchase',1000,1000,25),{ tds:25 });
  assert.throws(() => accountDeduction(context([]),unmatched,'purchase',1000,1000),/approved by Accounts/);
  assert.throws(() => accountDeduction(context([]),supplier,'purchase',1000,1000,25),/Leave the deduction blank/);
  assert.deepEqual(accountDeduction(context([]),{ code:'NONE', tds:false },'purchase',1000,1000),{ tds:0 });
  assert.equal(accountDeduction(context([]),supplier,'purchase',1000,1000).tds,0);
  const expired = { all:[], doc:{ id:'x', day:'2026-03-01' }, siteConfig:{ tdsRules:rules } };
  assert.throws(() => accountDeduction(expired,supplier,'purchase',1000,1000),/approved by Accounts/);
});
