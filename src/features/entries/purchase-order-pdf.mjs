// A purchase order as a PDF, section by section in the order of the form.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { footerRowsOf, purchaseOrderTotals, rupeesInWords } from './assets/purchase-order-totals.js';
import { accountVendor } from './account-vendors.mjs';
import { formatIndentNumber } from './indent-details.mjs';
import { review } from './review-masters.mjs';
import { locationName } from './site-locations.mjs';

// The built-in PDF fonts cover Latin text only; anything else is shown as "?" so the file always opens.
const latin = value => String(value ?? '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/₹/g, 'Rs.')
  .replace(/[^\x20-\x7e\xa0-\xff]/g, '?');
const money = value => Number(value ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const date = value => value ? String(value).split('-').reverse().join('-') : '';
const ist = (value, options) => value ? new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', ...options }).format(new Date(value)) : '';
const freightTypes = { Delivered: 'FOR', 'Ex-depot': 'To Pay' };

// What the PDF shows, as sections of label and value pairs, the footer rows and the totals.
export function purchaseOrderSheet(doc, sources = []) {
  const d = doc.data ?? {}, totals = purchaseOrderTotals(d), vendor = accountVendor(d.supplier);
  const indent = sources.find(row => row.id === d.indent);
  const footer = footerRowsOf(d).map((row, index) => ({ row, worked: totals.rows[index] })).filter(({ row }) => row.head)
    .map(({ row, worked }) => [row.head, row.legend ?? '', row.head === 'Round Off' ? '' : String(row.rate ?? ''),
      worked?.on == null ? '' : money(worked.on) + (worked.quantity ? ' L' : ''), money(worked?.value)]);
  return {
    number: doc.number || 'Draft', status: doc.status,
    sections: [
      ['Purchase Order Details', [['Location', locationName(doc.site)], ['Site', doc.site], ['PO Date', date(doc.day)], ['PO No.', doc.number || 'Draft'], ['Delivery Date', date(d.deliveryDate)],
        ['Indent No.', formatIndentNumber(indent?.number ?? '')], ['Undersigned (Employee)', d.undersigned]]],
      ['Vendor Details', [['Party / Vendor Name', d.supplier], ['Address', vendor?.address], ['Contact', vendor?.contact]]],
      ['Tax & Supply', [['Transaction Type', d.transactionType], ['Supply Nature', d.supplyNature], ['PO Type', d.type]]],
      ['Freight & Logistics', [['Lifting Location', d.depot], ['Freight Type', freightTypes[d.basis] ?? d.basis], ['Freight Contract No.', d.freightContract],
        ['Freight Rate (Rs./L)', d.freightRate], ['Landing on Gross', d.loadingOnGross]]],
      ['Material Details', [['Particular', review.item], ['Diesel Qty (L)', d.litres ?? (d.kl ? d.kl * 1000 : '')], ['Rate Before Disc.', d.rateBefore], ['Rate After Disc.', d.rateAfter],
        ['Net Rate', totals.netRate || ''], ['Amount', money(totals.amount)]]],
    ],
    footer,
    totals: [['Total (Before Footer Heads)', money(totals.amount)], ['Total Footer Heads', money(totals.footer)], ['P.O. Amount', money(totals.total)],
      ['Landed Rate (per Litre)', totals.landedRate.toFixed(4)]],
    words: rupeesInWords(totals.total),
    closing: [
      ['Tolerance & Shortage', [['Tolerance (%)', d.tolerance], ['Shortage Deduction From', d.shortageFrom], ['Shortage Deduction Method', d.shortageMethod], ['Freight Deduction Rate', d.freightDeductionRate]]],
      ['Payment', [['Is Full Payment as Advance?', d.terms === 'Advance' ? 'Yes' : d.terms === 'Credit' ? 'No' : ''], ['Advance Amount (Rs.)', d.advanceAmount == null ? '' : money(d.advanceAmount)],
        ['Payment Advice Location', d.paymentAdviceLocation], ['Payment Advice No.', d.paymentAdviceNo]]],
      ['Record Information', [['Creation Date', ist(doc.created, { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-')],
        ['Creation Time', ist(doc.created, { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase()], ['Created By', doc.createdBy]]],
    ],
  };
}

export const purchaseOrderPdf = (doc, sources) => purchaseOrdersPdf([doc], sources);

// Several purchase orders in one file, each starting on a new page.
export async function purchaseOrdersPdf(docs, sources) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(latin(docs.length === 1 ? 'Diesel Purchase Order ' + (docs[0].number || 'Draft') : 'Diesel Purchase Orders'));
  const labels = [];
  let sheet;
  const regular = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const left = 40, right = 555, ink = rgb(0.1, 0.12, 0.16), muted = rgb(0.38, 0.42, 0.48), line = rgb(0.8, 0.83, 0.87), band = rgb(0.93, 0.95, 0.98);
  let page, y;
  const start = () => { page = pdf.addPage([595, 842]); y = 800; labels.push(sheet.number); };
  const room = height => { if (y - height < 50) start(); };
  const text = (value, x, size = 10, font = regular, color = ink) => page.drawText(latin(value), { x, y, size, font, color });
  const fit = (value, font, size, width) => {
    let shown = latin(value);
    while (shown.length > 1 && font.widthOfTextAtSize(shown, size) > width) shown = shown.slice(0, -2) + '.';
    return shown;
  };
  const wrap = (value, width) => {
    const lines = [];
    let current = '';
    for (const word of latin(value || '-').split(' ')) {
      const next = current ? current + ' ' + word : word;
      if (current && regular.widthOfTextAtSize(next, 10) > width) { lines.push(current); current = word; } else current = next;
    }
    return [...lines, current];
  };
  const heading = title => {
    room(60);
    page.drawRectangle({ x: left, y: y - 5, width: right - left, height: 18, color: band });
    text(title, left + 6, 10.5, bold);
    y -= 22;
  };
  // Label and value pairs, two to a line.
  const pairs = rows => {
    const half = (right - left) / 2, labelWidth = 118;
    for (let index = 0; index < rows.length; index += 2) {
      const cells = rows.slice(index, index + 2).map(([label, value]) => [label, wrap(String(value ?? ''), half - labelWidth - 12)]);
      const height = Math.max(...cells.map(([, lines]) => lines.length)) * 13 + 5;
      room(height);
      cells.forEach(([label, lines], column) => {
        const x = left + 6 + column * half;
        page.drawText(latin(label), { x, y, size: 8.5, font: bold, color: muted });
        lines.forEach((value, row) => page.drawText(value, { x: x + labelWidth, y: y - row * 13, size: 10, font: regular, color: ink }));
      });
      y -= height;
    }
    y -= 6;
  };
  const section = ([title, rows]) => { heading(title); pairs(rows); };

  for (const doc of docs) {
  sheet = purchaseOrderSheet(doc, sources);
  start();
  text('Caliber Mining and Logistics Ltd', left, 10, regular, muted);
  y -= 24;
  text('Diesel Purchase Order', left, 19, bold);
  const state = fit(sheet.status, bold, 10, 150);
  page.drawText(state, { x: right - bold.widthOfTextAtSize(state, 10), y, size: 10, font: bold, color: muted });
  y -= 18;
  text(sheet.number, left, 12);
  y -= 10;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 1, color: line });
  y -= 20;
  sheet.sections.forEach(section);

  heading('Final Calculation - Footer / Tax');
  const columns = [['Seq', 30], ['Footer Head', 150], ['Legend', 60], ['Rate / %', 80], ['Calculated On', 100], ['Value (Rs.)', 95]];
  const tableRow = (cells, font, color) => {
    room(16);
    let x = left + 6;
    cells.forEach((cell, index) => { page.drawText(fit(cell, font, 9.5, columns[index][1] - 6), { x, y, size: 9.5, font, color }); x += columns[index][1]; });
    y -= 6;
    page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.5, color: line });
    y -= 12;
  };
  tableRow(columns.map(([label]) => label), bold, muted);
  if (sheet.footer.length) sheet.footer.forEach((row, index) => tableRow([String(index + 1), ...row], regular, ink));
  else tableRow(['', 'No footer heads', '', '', '', ''], regular, muted);
  y -= 4;
  for (const [label, value] of sheet.totals) {
    room(16);
    const grand = label === 'P.O. Amount', font = grand ? bold : regular, size = grand ? 11.5 : 10;
    page.drawText(label, { x: 330, y, size, font, color: grand ? ink : muted });
    const shown = latin((label.startsWith('Landed') ? 'Rs. ' : 'Rs. ') + value);
    page.drawText(shown, { x: right - 6 - font.widthOfTextAtSize(shown, size), y, size, font, color: ink });
    y -= grand ? 18 : 15;
  }
  if (sheet.words) { room(30); text('PO Amount in Words', left + 6, 8.5, bold, muted); y -= 13; for (const row of wrap(sheet.words, right - left - 12)) { text(row, left + 6); y -= 13; } }
  y -= 8;
  sheet.closing.forEach(section);

  }
  const pages = pdf.getPages();
  pages.forEach((sheetPage, index) => sheetPage.drawText(latin('Generated from Diesel · ' + labels[index] + ' · Page ' + (index + 1) + ' of ' + pages.length),
    { x: left, y: 28, size: 8, font: regular, color: muted }));
  return pdf.save();
}

// Any other register as a PDF list: one line per record.
export async function registerPdf(title, head, rows) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(latin(title));
  const regular = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const left = 40, right = 555, ink = rgb(0.1, 0.12, 0.16), muted = rgb(0.38, 0.42, 0.48), line = rgb(0.8, 0.83, 0.87);
  const width = (right - left) / head.length;
  let page, y;
  const cut = (value, font) => { let shown = latin(value); while (shown.length > 1 && font.widthOfTextAtSize(shown, 9) > width - 6) shown = shown.slice(0, -2) + '.'; return shown; };
  const draw = (cells, font, color) => {
    cells.forEach((cell, index) => page.drawText(cut(cell, font), { x: left + index * width, y, size: 9, font, color }));
    y -= 5; page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.5, color: line }); y -= 12;
  };
  const start = () => {
    page = pdf.addPage([595, 842]); y = 800;
    page.drawText('Caliber Mining and Logistics Ltd', { x: left, y, size: 10, font: regular, color: muted }); y -= 22;
    page.drawText(latin(title), { x: left, y, size: 16, font: bold, color: ink }); y -= 24;
    draw(head, bold, muted);
  };
  start();
  for (const row of rows) { if (y < 50) start(); draw(row, regular, ink); }
  if (!rows.length) page.drawText('No records.', { x: left, y, size: 10, font: regular, color: muted });
  const pages = pdf.getPages();
  pages.forEach((sheetPage, index) => sheetPage.drawText('Generated from Diesel - Page ' + (index + 1) + ' of ' + pages.length, { x: left, y: 28, size: 8, font: regular, color: muted }));
  return pdf.save();
}
