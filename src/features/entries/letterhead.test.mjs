import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { read, utils } from 'xlsx';
import { company, letterheadHtml, letterheadRows } from './letterhead.mjs';
import { entryExcel, entryCsv } from './entry-register.mjs';
import { registerPdf } from './purchase-order-pdf.mjs';

test('the company letterhead tops prints, PDFs and Excel, and CSV stays plain data', async () => {
  const html = letterheadHtml();
  assert.match(html, /class="print-only letterhead"><img src="\/entries\/assets\/caliber-logo\.png"/);
  assert.ok(html.includes('CALIBER MINING AND LOGISTICS LIMITED') && html.includes('mohit@chaddagroup.com') && !html.includes('style='));

  const rows = [['Document', 'Status'], ['IND-1', 'Posted']];
  const sheet = read(entryExcel(rows)).Sheets['Diesel Entries'];
  const cells = utils.sheet_to_json(sheet, { header: 1 });
  assert.equal(cells[0][0], company.name);
  assert.match(cells[1][0], /NANIKS ASHTAVINAYAK PARK AVENUE/);
  assert.match(cells[2][0], /07722233455/);
  assert.deepEqual(cells.slice(4), rows, 'headings and data follow a blank row');
  assert.equal(sheet['!merges'].length, 3);
  assert.equal(letterheadRows().length, 4);

  assert.ok(!entryCsv(rows).includes('CALIBER MINING'), 'CSV carries data only');

  const pdf = await PDFDocument.load(await registerPdf('Diesel entries', ['Document', 'Status'], [['IND-1', 'Posted']]));
  assert.equal(pdf.getPageCount(), 1);
});
