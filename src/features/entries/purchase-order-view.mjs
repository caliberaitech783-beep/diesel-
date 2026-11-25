// A saved purchase order laid out like its form: the same cards, read rather than typed.
import { purchaseOrderSheet } from './purchase-order-pdf.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const shown = value => value === undefined || value === null || value === '' ? '—' : esc(value);

export function purchaseOrderView(doc, sources) {
  const sheet = purchaseOrderSheet(doc, sources);
  const card = ([title, rows], extra = '') => `<section class="order-card order-view-card ${extra}"><h2>${esc(title)}</h2><dl class="order-view-list">${rows.map(([label, value]) =>
    `<div><dt>${esc(label)}</dt><dd>${shown(value)}</dd></div>`).join('')}</dl></section>`;
  const [details, vendor, tax, freight, material] = sheet.sections;
  const cells = Object.fromEntries(material[1]);
  return `<div class="order-view">
    <div class="order-top">${card(details)}${card(vendor)}<div class="order-stack">${card(tax)}${card(freight)}</div></div>
    <section class="order-card"><h2>Material Details</h2><div class="order-table"><table><thead><tr><th>#</th><th>Particular (Material Name)</th><th>Diesel Qty (L)</th><th>Rate Before Disc.</th>
      <th>Rate After Disc.</th><th>Net Rate</th><th>Amount</th></tr></thead><tbody><tr><td>1</td>${['Particular', 'Diesel Qty (L)', 'Rate Before Disc.', 'Rate After Disc.', 'Net Rate', 'Amount']
        .map(label => `<td>${shown(cells[label])}</td>`).join('')}</tr></tbody></table></div></section>
    <div class="order-calc"><section class="order-card"><h2>Final Calculation – Footer / Tax</h2><div class="order-table"><table><thead><tr><th>Seq</th><th>Footer Head</th><th>Legend</th><th>Rate / %</th>
      <th>Calculated On</th><th>Value (₹)</th></tr></thead><tbody>${sheet.footer.length ? sheet.footer.map((row, index) => `<tr><td>${index + 1}</td>${row.map((value, at) =>
        `<td>${at === 1 && value ? `<span class="legend">${esc(value)}</span>` : shown(value)}</td>`).join('')}</tr>`).join('') : '<tr><td colspan="6">No footer heads</td></tr>'}</tbody></table></div></section>
      <div class="order-totals">${sheet.totals.map(([label, value]) => `<div${label === 'P.O. Amount' ? ' class="grand"' : ''}><span>${esc(label)}</span><output>₹ ${esc(value)}</output></div>`).join('')}
        <div class="words"><span>PO Amount in Words</span><output>${shown(sheet.words)}</output></div></div></div>
    <div class="order-terms">${card(sheet.closing[0])}${card(sheet.closing[1])}</div>
    ${card(sheet.closing[2], 'order-view-record')}</div>`;
}
