import assert from 'node:assert/strict';
import test from 'node:test';
import { dieselRate } from './assets/diesel-rate-formula.mjs';

test('the Diesel rate is basic plus excise, less an invoice discount, plus VAT', () => {
  const parts = { basic: '100000', excise: '20000', vatPercent: '25' };
  assert.equal(dieselRate(parts).perKilolitre, 150000);
  assert.equal(dieselRate({ ...parts, discount: '2000', discountType: 'Invoice discount' }).perKilolitre, 147500);
  assert.equal(dieselRate({ ...parts, discount: '2000', discountType: 'Post-sale discount' }).perKilolitre, 150000);
  assert.equal(dieselRate({ basic: 90000, excise: 0, vatPercent: 0 }).perLitre, 90);
  assert.equal(dieselRate({ basic: '85123.45', excise: '13000', vatPercent: '24' }).perKilolitre, 121673.078);
  assert.equal(dieselRate({ basic: '85.12345', excise: '13', vatPercent: '24' }).perKilolitre, 121.6731, 'per-litre rates keep four decimals');
  for (const invalid of [{ ...parts, basic: '0' }, { ...parts, basic: '' }, { ...parts, vatPercent: '101' }, { ...parts, excise: '-1' },
    { ...parts, discount: '2000' }, { ...parts, discount: '120000', discountType: 'Invoice discount' }, { ...parts, discount: 'x', discountType: 'Invoice discount' }]) {
    assert.equal(dieselRate(invalid), null);
  }
});
