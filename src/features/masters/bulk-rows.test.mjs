import assert from 'node:assert/strict';
import test from 'node:test';
import { findRecordSheet, maxBulkRows, readRecordRows } from './assets/bulk-rows.mjs';
import { masterDefinition } from './records-fields.mjs';

const importable = slug => masterDefinition(slug).fields.filter(field => field.type !== 'file' && !field.readOnly)
  .map(({ key, label, type, options }) => ({ key, label, type, options }));

test('a templates workbook sheet with title rows imports one record per row', () => {
  const rows = [
    ['DIESEL RATE MASTER  —  New for Pulse'], ['Price notification per supplier and depot; rates are per KL.'], [], ['New in Pulse'],
    ['Supplier *', 'Depot *', 'Price basis (Ex-depot / Delivered) *', 'Effective from *', 'Effective to', 'Basic rate (₹/KL) *', 'Excise duty (₹/KL) *',
      'VAT (%) by state *', 'Discount (₹/KL)', 'Diesel rate (₹/KL), worked out *', 'Old iBoss column'],
    ['SUP-1', 'Jamnagar', 'ex-depot', '19-11-2026', '', '1,00,000', '20000', '25', '', '150000', 'ignored'],
    [], ['SUP-2', 'Nagpur', 'Delivered', '2026-12-01', '1/3/2027', '90000.50', '0', '0', '', '', ''],
  ];
  const { records, unused } = readRecordRows(rows, importable('diesel-rate-master'));
  assert.deepEqual(unused, ['Diesel rate (₹/KL), worked out *', 'Old iBoss column']);
  assert.deepEqual(records.map(record => record.row), [6, 8]);
  assert.deepEqual(Object.fromEntries(records[0].values), { Supplier: 'SUP-1', Depot: 'Jamnagar', 'Price basis (Ex-depot / Delivered)': 'Ex-depot',
    'Effective from': '2026-11-19', 'Basic rate (₹/KL)': '100000', 'Excise duty (₹/KL)': '20000', 'VAT (%) by state': '25' });
  assert.equal(Object.fromEntries(records[1].values)['Effective to'], '2027-03-01');
});

test('repeated column names follow the form order, and unusable files are refused', () => {
  const fields = importable('driver-master');
  const pair = fields.filter(field => field.label === 'Remark');
  assert.deepEqual(pair.map(field => field.key), ['Attendance and settings / Remark', 'Qualification / Remark']);
  const { records } = readRecordRows([['Employee Code', 'Employee Name', 'Remark', 'Remark'], ['1001', 'Operator one', 'first', 'second']], fields);
  assert.deepEqual(records[0].values.slice(2), [[pair[0].key, 'first'], [pair[1].key, 'second']]);
  const byKey = readRecordRows([['Employee Code', 'Employee Name', pair[1].key], ['1002', 'Operator two', 'direct']], fields);
  assert.deepEqual(byKey.records[0].values[2], [pair[1].key, 'direct']);
  assert.throws(() => readRecordRows([['Name', 'Quantity'], ['x', '1']], fields), /no header row/);
  assert.throws(() => readRecordRows([['Employee Code', 'Employee Name'], ['', '']], fields), /no records/);
  const many = [['Employee Code', 'Employee Name'], ...Array.from({ length: maxBulkRows + 1 }, (_, index) => [String(index), 'Name'])];
  assert.throws(() => readRecordRows(many, fields), /up to 500/);
  assert.equal(findRecordSheet(['Index', 'Tax Master', 'GST Master'], 'Tax Master (TDS)'), 'Tax Master');
  assert.equal(findRecordSheet(['Index', 'GST Master'], 'GST Master'), 'GST Master');
  assert.equal(findRecordSheet(['Sheet1'], 'GST Master'), 'Sheet1');
});
