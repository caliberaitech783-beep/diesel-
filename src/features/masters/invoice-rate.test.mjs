import assert from 'node:assert/strict';
import test from 'node:test';
import { invoiceRate } from './assets/invoice-rate.mjs';

test('the rate includes the entire invoice once, preserving the rate before display rounding', () => {
  assert.deepEqual(invoiceRate('90000', '1000'), { perLitre: 90, perKilolitre: 90000 });
  assert.equal(invoiceRate('100', '3').perLitre, 100 / 3);
  for (const [total, qty] of [[1, 0], [1, -1], ['', 20], [0, 12], [100, Infinity]]) {
    assert.equal(invoiceRate(total, qty), null);
  }
});
