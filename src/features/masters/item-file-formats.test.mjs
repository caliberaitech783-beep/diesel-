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
import { readItemCsv, readItemExcel, readItemPdf, writeItemCsv, writeItemExcel, writeItemPdf } from './assets/item-file-formats.mjs';

const values = new Map([
  ['Item Code', '00037'],
  ['Item Name', 'डीज़ल, "Premium" – A'],
  ['Category', '=1+1'],
  ['Bulk Density', '-0.45'],
  ['HSN Code', '00123456'],
  ['Item Nature', "'=1+1"],
]);
const names = [...values.keys()];
const encode = text => new TextEncoder().encode(text);

test('Item Master Excel and CSV preserve item codes, Unicode and formula-like values', () => {
  const workbook = writeItemExcel(values, xlsx);
  assert.deepEqual(readItemExcel(workbook, names, xlsx), values);
  const csv = writeItemCsv(values, { stringify });
  assert.ok(csv.includes(",'=1+1,"));
  assert.deepEqual(readItemCsv(encode(csv), names, { parse }), values);
  assert.throws(() => readItemCsv(encode('Item Code,Item Name\n001,First\n002,Second'), names, { parse }), /one record/);
  assert.throws(() => readItemCsv(encode('Item Code,Item code\n001,002'), names, { parse }), /twice/);
});

test('An exported Item Master PDF remains fillable and reimports its edited field values', async () => {
  const require = createRequire(import.meta.url);
  const fontDirectory = dirname(require.resolve('@expo-google-fonts/noto-sans-devanagari/package.json'));
  const font = await readFile(resolve(fontDirectory, '400Regular/NotoSansDevanagari_400Regular.ttf'));
  const bytes = await writeItemPdf(values, pdf, fontkit, font);
  assert.deepEqual(await readItemPdf(bytes, names, pdf), values);

  const document = await pdf.PDFDocument.load(bytes);
  document.registerFontkit(fontkit);
  document.getForm().getTextField('Item Name').setText('नया डीज़ल');
  document.getForm().updateFieldAppearances(await document.embedFont(font));
  const edited = await document.save();
  assert.equal((await readItemPdf(edited, names, pdf)).get('Item Name'), 'नया डीज़ल');
});
