import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import * as xlsx from 'xlsx';
import * as pdf from 'pdf-lib';
import 'regenerator-runtime/runtime.js';
import fontkit from '@pdf-lib/fontkit';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { writeCsvTable, writeExcelTable } from '../masters/assets/tabular-files.mjs';
import { exportTable, fitExcelCells, writeMasterDataPdf } from './assets/export-data.mjs';
import { pulseMasterExport } from '../pulse-masters/pulse-master-export.mjs';
import { pulseMaster } from '../pulse-masters/pulse-master-catalog.mjs';

const rows = [
  {
    master: 'Item Master', code: '0001', name: 'डीज़ल', status: 'pending', site: '', revision: 1,
    updatedAt: '2026-11-18T04:30:00.000Z', fields: [['HSN Code', '00123456'], ['Category', '=1+1']],
  },
  {
    master: 'Storage Location Master', code: 'ST-001', name: 'Tank', status: 'approved', site: 'Jayant', revision: 2,
    updatedAt: '2026-11-18T04:32:00.000Z', fields: [['Capacity (L)', '10000'], ['Calibration chart', 'Data']],
  },
];

test('Master Data exports each record with fields from all selected masters', () => {
  const { columns, rows: cells } = exportTable(rows, true);
  const hsn = columns.indexOf('HSN Code');
  const category = columns.indexOf('Category');
  const capacity = columns.indexOf('Capacity (L)');
  const csv = parse(writeCsvTable(columns, cells, { stringify }), { bom: true });
  assert.equal(csv[1][hsn], '00123456');
  assert.equal(csv[1][category], "'=1+1");
  assert.equal(csv[2][capacity], '10000');
  const workbook = xlsx.read(writeExcelTable('Master Data', columns, cells, xlsx));
  assert.deepEqual(xlsx.utils.sheet_to_json(workbook.Sheets['Master Data'], { header: 1 }), [columns, ...cells]);
  assert.ok(!exportTable(rows, false).columns.includes('Site'));
  const formColumns = ['Category', 'HSN Code', 'Bulk Density'];
  assert.deepEqual(exportTable(rows.slice(0, 1), false, formColumns), {
    columns: formColumns, rows: [['=1+1', '00123456', '']],
  });
  assert.deepEqual(exportTable([], false, formColumns), { columns: formColumns, rows: [] });
  const long = 'a'.repeat(32766) + '🛢' + 'b'.repeat(33000);
  const split = fitExcelCells({ columns: ['Remark'], rows: [[long], ['short']] });
  const exported = xlsx.read(writeExcelTable('Master Data', split.columns, split.rows, xlsx));
  const [, longRow, shortRow] = xlsx.utils.sheet_to_json(exported.Sheets['Master Data'], { header: 1 });
  assert.equal(longRow.join(''), long);
  assert.equal(shortRow.join(''), 'short');
});

test('Master Data PDF paginates long fields and supports an empty export', async () => {
  const require = createRequire(import.meta.url);
  const fontDirectory = dirname(require.resolve('@expo-google-fonts/noto-sans-devanagari/package.json'));
  const font = await readFile(resolve(fontDirectory, '400Regular/NotoSansDevanagari_400Regular.ttf'));
  const long = [...rows, { ...rows[1], fields: [['Calibration chart', ('1234 डीज़ल '.repeat(200) + '\n').repeat(3)]] }];
  const document = await pdf.PDFDocument.load(await writeMasterDataPdf(long, true, pdf, fontkit, font));
  assert.equal(document.getTitle(), 'Diesel Master Data');
  assert.ok(document.getPageCount() > 1);
  const empty = await pdf.PDFDocument.load(await writeMasterDataPdf([], false, pdf, fontkit, font));
  assert.equal(empty.getPageCount(), 1);
});

test('Pulse master downloads write CSV, Excel and PDF with the listed fields', async () => {
  const master = pulseMaster('site');
  const data = pulseMasterExport(master, [{ name: '00123 डीज़ल', region: '=1+1', regionCode: 'WR', state: 'MH' }]);
  const table = exportTable(data.records, data.showSite, data.columns);
  assert.deepEqual(table.columns, ['Location', 'Region', 'Region short name', 'State code']);
  const csv = parse(writeCsvTable(table.columns, table.rows, { stringify }), { bom: true });
  assert.deepEqual(csv[1], ['00123 डीज़ल', "'=1+1", 'WR', 'MH']);
  const workbook = xlsx.read(writeExcelTable('Master Data', table.columns, table.rows, xlsx));
  assert.deepEqual(xlsx.utils.sheet_to_json(workbook.Sheets['Master Data'], { header: 1 }), [table.columns, ...table.rows]);
  const require = createRequire(import.meta.url);
  const fontDirectory = dirname(require.resolve('@expo-google-fonts/noto-sans-devanagari/package.json'));
  const font = await readFile(resolve(fontDirectory, '400Regular/NotoSansDevanagari_400Regular.ttf'));
  const document = await pdf.PDFDocument.load(await writeMasterDataPdf(data.records, data.showSite, pdf, fontkit, font, data.columns));
  assert.equal(document.getPageCount(), 1);
  assert.equal(document.getTitle(), 'Diesel Master Data');
});
