// The Diesel Purchase Order form (E2): one page with order details, vendor, tax, freight, material and
// footer calculation, tolerance and shortage, payment and, last, the record information.
import { esc } from './entry-shell.mjs';
import { sourceChoices } from './entry-choices.mjs';
import { formatIndentNumber } from './indent-details.mjs';
import { review } from './review-masters.mjs';
import { accountVendors } from './account-vendors.mjs';
import { footerHeads, footerLegends, footerRowsOf, purchaseOrderTotals, rupeesInWords } from './assets/purchase-order-totals.js';

const star = '<b class="req" aria-hidden="true">*</b>';
const icon = path => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
const icons = {
  order: icon('<path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6"/>'),
  vendor: icon('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.5a6.4 6.4 0 0 1 3.5 5.5"/>'),
  tax: icon('<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>'),
  freight: icon('<path d="M2 6h11v10H2zM13 10h4l4 3v3h-8zM6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>'),
  layers: icon('<path d="m12 3 9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5"/>'),
  sum: icon('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 12h2M14 12h2M8 16h2M14 16h2"/>'),
  truck: icon('<path d="M3 7h10v9H3zM13 11h4l4 3v2h-8zM7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>'),
  pay: icon('<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>'),
};
const rupee = value => '₹ ' + Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function purchaseOrderHeading(doc) {
  return `<div class="order-heading"><span class="order-heading-icon" aria-hidden="true">${icons.order}</span>
    <div><h1>Diesel Purchase Order</h1><p>${doc.rev ? 'Edit this PO for diesel purchase' : 'Create a new PO for diesel purchase'}</p></div></div>`;
}

export function purchaseOrderFields(actor, doc, meta, rows) {
  const d = doc.data, field = key => meta.fields.find(f => f.key === key);
  const card = (name, title, body, extra = '') => `<fieldset class="order-card order-${name}"><legend>${icons[extra || name] ?? ''}<span>${title}</span></legend>${body}</fieldset>`;
  function select(key, label, { required = false, labels, attrs = '', offer } = {}) {
    const f = field(key), value = d[key] ?? f.default ?? '';
    // `offer` narrows what a new order offers; a value saved earlier stays selectable on that order.
    const options = f.options.filter(v => !offer || offer.includes(v) || v === value).map(v => [v, labels?.[v] ?? f.optionLabels?.get(v) ?? v]);
    const only = !value && required && options.length === 1;
    return `<label><span>${esc(label)}${required ? star : ''}</span><select name="${key}"${required ? ' data-required="true"' : ''} ${attrs}><option value=""${value || only ? '' : ' selected'}>Select…</option>${
      options.map(([v, n]) => `<option value="${esc(v)}"${v === value || only ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>`;
  }
  function input(key, label, { required = false, type, attrs = '', value } = {}) {
    const f = field(key), kind = type ?? f.type;
    return `<label><span>${esc(label)}${required ? star : ''}</span><input name="${key}" type="${kind}"${required ? ' data-required="true"' : ''}${kind === 'number' ? ' step="any" min="0" inputmode="decimal"' : ''} ${attrs} value="${esc(value ?? d[key] ?? '')}"></label>`;
  }
  // A box to type in that searches a long list. The chosen record's value travels in the hidden field.
  function search(key, label, choices, selected, placeholder) {
    const current = choices.find(choice => choice.value === selected);
    return `<label><span>${esc(label)}${star}</span><input type="search" data-search-for="${key}" data-required="true" list="order-${key}-list" autocomplete="off" placeholder="${esc(placeholder)}" value="${esc(current?.label ?? '')}">
      <input type="hidden" name="${key}" value="${esc(current?.value ?? '')}"><datalist id="order-${key}-list">${choices.map(choice =>
        `<option value="${esc(choice.label)}" data-value="${esc(choice.value)}"${choice.remaining === undefined ? '' : ` data-remaining="${esc(choice.remaining)}"`}>`).join('')}</datalist></label>`;
  }
  const readOnly = (label, value, attrs = '') => `<label>${esc(label)}<input type="text" readonly tabindex="-1" ${attrs} value="${esc(value ?? '')}"></label>`;

  // Indents with quantity still to order, and how much is left on each.
  const indentField = field('indent');
  const ordered = id => rows.filter(row => row.type === 'E2' && row.id !== doc.id && row.data.indent === id && !['Draft', 'Superseded', 'Returned'].includes(row.status))
    .reduce((sum, row) => sum + Number(row.result.litres ?? 0), 0);
  const indents = sourceChoices(indentField, doc, rows, actor);
  const indentChoices = indents.map(row => ({ value: row.id, label: formatIndentNumber(row.number), remaining: Math.max(0, row.result.litres - ordered(row.id)) }));
  // Vendors come from the Account Master: the approved accounts of a live site, otherwise the company's own list.
  const supplierField = field('supplier');
  const vendorChoices = supplierField.options.map(value => ({ value, label: supplierField.optionLabels?.get(value) ?? value }));
  const vendorDetails = meta.accountDetails ?? Object.fromEntries(accountVendors.map(vendor => [vendor.name, { address: vendor.address, contact: vendor.contact }]));

  // The undersigned is the signed-in person: their Employee Master name and ID, or their Pulse name when no employee record matches.
  const employee = actor.employee ? actor.employee.name + ' · ' + actor.employee.empId : actor.requestedBy ?? '';
  const item = meta.orderItem, itemName = item ? item.code + ' · ' + item.name : review.item;
  const created = new Date(doc.created ?? Date.now());
  const stamp = options => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', ...options }).format(created);
  const totals = purchaseOrderTotals(d);
  const deliveries = d.deliveries ?? [];
  // A new order shows one footer row, with its head and legend chosen from a list; more are added one at a time, up to five.
  // An order saved earlier shows the rows it was saved with.
  const saved = d.footerRows?.length || d.exciseRate !== undefined || d.vatPercent !== undefined ? footerRowsOf(d) : [];
  const shown = Math.max(1, saved.length);
  const pickFrom = (kind, list, value, label) => `<select data-foot="${kind}" aria-label="${label}"><option value="">Select…</option>${list.map(item => `<option${item === value ? ' selected' : ''}>${esc(item)}</option>`).join('')}</select>`;
  const footerRows = Array.from({ length: Math.max(5, saved.length) }, (_, index) => saved[index] ?? {}).map((row, index) => `      <tr${index < shown ? '' : ' hidden'}><td>${index + 1}</td>
        <td>${pickFrom('head', footerHeads, row.head, 'Footer head ' + (index + 1))}</td><td>${pickFrom('legend', footerLegends, row.legend, 'Legend ' + (index + 1))}</td>
        <td><input data-foot="rate" type="number" step="any" min="0" inputmode="decimal" aria-label="Rate or percent ${index + 1}" value="${esc(row.rate ?? '')}"></td>
        <td><output data-foot="on"></output></td><td><output data-foot="value"></output></td></tr>`).join('\n')
    + `\n<input type="hidden" name="footerRows" value="${esc(JSON.stringify(saved.filter(row => row.head)))}">`;
  const advance = (d.terms ?? 'Advance') === 'Advance';

  return `<div class="order-top">
    ${card('details', 'Purchase Order Details', `<div class="order-grid three">
      ${readOnly('Location', doc.site)}
      <label><span>PO Date${star}</span><input name="day" type="date" data-required="true" max="${esc(actor.businessDay ?? doc.day)}" value="${esc(doc.day)}"></label>
      ${readOnly('PO No.', formatIndentNumber(doc.number) || '', 'placeholder="Auto-generated"')}
      ${input('deliveryDate', 'Delivery Date', { attrs: `min="${esc(doc.day)}"` })}
      <div class="span-two">${search('indent', 'Indent No.', indentChoices, d.indent, indents.length ? 'Search indent number' : 'No approved indent with a balance')}</div>
      <label class="span-three"><span>Undersigned (Employee)${star}</span><input name="undersigned" type="text" readonly tabindex="-1" data-required="true" maxlength="200" value="${esc(d.undersigned || employee)}"></label>
    </div>`, 'order')}
    ${card('vendor', 'Vendor Details', `${search('supplier', 'Party / Vendor Name', vendorChoices, d.supplier, 'Search the Account Master')}
      <div class="vendor-contact" data-accounts="${esc(JSON.stringify(vendorDetails))}">${icon('<path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.800 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>')}
        <div><strong>Vendor's Address &amp; Contact</strong><p data-vendor-address>Select a vendor to see its address.</p><p data-vendor-contact></p></div></div>`)}
    <div class="order-stack">
    ${card('tax', 'Tax &amp; Supply', `<div class="order-grid three">${select('transactionType', 'Transaction Type', { required: true })}${select('supplyNature', 'Supply Nature', { required: true, offer: ['Non-GST Supplies', 'Taxable Supplies'] })}${select('type', 'PO Type', { required: true })}</div>`)}
    ${card('freight', 'Freight &amp; Logistics', `<div class="order-grid two">${field('depot').options ? select('depot', 'Lifting Location', { required: !field('depot').optional }) : input('depot', 'Lifting Location', { required: true, type: 'text', attrs: 'maxlength="200" autocomplete="off" placeholder="Enter lifting location"', value: d.depot === review.depot ? '' : d.depot })}
      ${select('basis', 'Freight Type', { required: true, labels: { Delivered: 'FOR', 'Ex-depot': 'To Pay' } })}
      ${input('freightContract', 'Freight Contract No.', { attrs: 'maxlength="100" autocomplete="off"' })}
      ${input('freightRate', 'Freight Rate (₹/L)')}
      <label class="order-check"><input type="checkbox" data-loading-gross${d.loadingOnGross === 'No' ? '' : ' checked'}><input type="hidden" name="loadingOnGross" value="${d.loadingOnGross === 'No' ? 'No' : 'Yes'}">Landing on Gross</label></div>`)}
    </div></div>
    ${card('material', 'Material Details', `<div class="order-table"><table><thead><tr><th>#</th><th>Particular (Material Name)</th><th>HSN Code</th><th>Diesel Qty (L)${star}</th>
      <th>Rate Before Disc.${star}</th><th>Rate After Disc.${star}</th><th>Net Rate</th><th>Amount</th><th>Landed Rate</th><th>Material In No.</th><th>GRN No.</th></tr></thead>
      <tbody><tr><td>1</td><td><input type="text" readonly tabindex="-1" aria-label="Particular" value="${esc(itemName)}"></td>
      <td><input type="text" readonly tabindex="-1" aria-label="HSN Code" value="${esc(item?.hsn ?? '—')}"></td>
      <td><input name="litres" type="number" step="any" min="0" inputmode="decimal" data-required="true" aria-label="Diesel Qty (L)" value="${esc(d.litres ?? '')}"></td>
      <td><input name="rateBefore" type="number" step="any" min="0" inputmode="decimal" data-required="true" aria-label="Rate before discount" value="${esc(d.rateBefore ?? '')}"></td>
      <td><input name="rateAfter" type="number" step="any" min="0" inputmode="decimal" data-required="true" aria-label="Rate after discount" value="${esc(d.rateAfter ?? '')}"></td>
      <td><output data-order="netRate">${esc(totals.netRate || '')}</output></td><td><output data-order="amount">${esc(totals.amount ? rupee(totals.amount).slice(2) : '')}</output></td>
      <td><output data-order="landedRate">${esc(totals.landedRate || '')}</output></td><td>—</td><td>—</td></tr></tbody></table></div>`, 'layers')}
    <div class="order-calc">
    ${card('footer', 'Final Calculation – Footer / Tax', `<div class="order-table"><table><thead><tr><th>Seq</th><th>Footer Head</th><th>Legend</th><th>Rate / %</th><th>Calculated On</th><th>Value (₹)</th></tr></thead><tbody data-footer-rows>
${footerRows}
      </tbody></table></div><div class="order-schedule-foot"><button type="button" data-add-footer-row>+ Add footer row</button></div>`, 'sum')}
    <div class="order-totals"><div><span>Total (Before Footer Heads)</span><output data-order="amountTotal">${rupee(totals.amount)}</output></div>
      <div><span>Total Footer Heads</span><output data-order="footer">${rupee(totals.footer)}</output></div>
      <div class="grand"><span>P.O. Amount</span><output data-order="total">${rupee(totals.total)}</output></div>
      <div><span>Landed Rate (per Litre)</span><output data-order="landed">₹ ${esc(totals.landedRate.toFixed(4))}</output></div>
      <div class="words"><span>PO Amount in Words</span><output data-order="words">${esc(rupeesInWords(totals.total))}</output></div></div>
    </div>
    <div class="order-terms">
    ${card('tolerance', 'Tolerance &amp; Shortage', `<div class="order-grid two">${input('tolerance', 'Tolerance (%)', { required: true })}
      ${select('shortageFrom', 'Shortage Deduction From', { required: true })}${select('shortageMethod', 'Shortage Deduction Method', { required: true })}
      ${input('freightDeductionRate', 'Freight Deduction Rate', { attrs: 'placeholder="Not required"' })}</div>
      <p class="order-hint">Rate is required only for Percent or Fixed deduction.</p>`, 'truck')}
    ${card('payment', 'Payment', `<div class="order-toggle" role="group" aria-label="Is full payment as advance?"><span>Is Full Payment as Advance?${star}</span>
      <input type="hidden" name="terms" value="${advance ? 'Advance' : 'Credit'}">
      <button type="button" data-terms="Advance" aria-pressed="${advance}">Yes</button><button type="button" data-terms="Credit" aria-pressed="${!advance}">No</button></div>
      <div class="order-grid three">${input('advanceAmount', 'Advance Amount (₹)')}${input('paymentAdviceLocation', 'Payment Advice Location', { attrs: 'maxlength="100" autocomplete="off"' })}
      ${input('paymentAdviceNo', 'Payment Advice No.', { attrs: 'maxlength="100" autocomplete="off" placeholder="Enter advice number"' })}</div>`, 'pay')}
    </div>
<input type="hidden" name="deliveries" value="${esc(JSON.stringify(deliveries))}">
    <div class="order-record">${icons.layers}<strong>Record Information</strong>
      <span>Creation Date <b>${esc(stamp({ day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-'))}</b></span>
      <span>Creation Time <b>${esc(stamp({ hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase())}</b></span>
      <span>Created By <b>${esc(doc.createdBy ?? actor.employee?.name ?? actor.requestedBy ?? doc.role ?? '')}</b></span></div>`;
}
