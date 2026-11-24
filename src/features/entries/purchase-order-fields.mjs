// The Diesel Purchase Order form (E2): one page with order details, vendor, tax, freight, material and
// footer calculation, tolerance and shortage, payment and the delivery schedule.
import { esc } from './entry-shell.mjs';
import { sourceChoices } from './entry-choices.mjs';
import { formatIndentNumber } from './indent-details.mjs';
import { review } from './review-masters.mjs';
import { purchaseOrderTotals, rupeesInWords } from './assets/purchase-order-totals.js';

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
  function select(key, label, { required = false, labels, attrs = '' } = {}) {
    const f = field(key), value = d[key] ?? f.default ?? '';
    const options = f.options.map(v => [v, labels?.[v] ?? f.optionLabels?.get(v) ?? v]);
    const only = !value && required && options.length === 1;
    return `<label><span>${esc(label)}${required ? star : ''}</span><select name="${key}"${required ? ' data-required="true"' : ''} ${attrs}><option value=""${value || only ? '' : ' selected'}>Select…</option>${
      options.map(([v, n]) => `<option value="${esc(v)}"${v === value || only ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>`;
  }
  function input(key, label, { required = false, type, attrs = '', value } = {}) {
    const f = field(key), kind = type ?? f.type;
    return `<label><span>${esc(label)}${required ? star : ''}</span><input name="${key}" type="${kind}"${required ? ' data-required="true"' : ''}${kind === 'number' ? ' step="any" min="0" inputmode="decimal"' : ''} ${attrs} value="${esc(value ?? d[key] ?? '')}"></label>`;
  }
  const readOnly = (label, value, attrs = '') => `<label>${esc(label)}<input type="text" readonly tabindex="-1" ${attrs} value="${esc(value ?? '')}"></label>`;

  // Indents with quantity still to order, and how much is left on each.
  const indentField = field('indent');
  const ordered = id => rows.filter(row => row.type === 'E2' && row.id !== doc.id && row.data.indent === id && !['Draft', 'Superseded', 'Returned'].includes(row.status))
    .reduce((sum, row) => sum + Number(row.result.litres ?? 0), 0);
  const indents = sourceChoices(indentField, doc, rows, actor);
  const indentOptions = indents.map(row => `<option value="${esc(row.id)}" data-remaining="${esc(Math.max(0, row.result.litres - ordered(row.id)))}"${
    row.id === d.indent || (!d.indent && indents.length === 1) ? ' selected' : ''}>${esc(formatIndentNumber(row.number))}</option>`).join('');

  const employee = actor.employee ? actor.employee.name + ' · ' + actor.employee.empId : '';
  const item = meta.orderItem, itemName = item ? item.code + ' · ' + item.name : review.item;
  const created = new Date(doc.created ?? Date.now());
  const stamp = options => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', ...options }).format(created);
  const totals = purchaseOrderTotals(d);
  const deliveries = d.deliveries ?? [];
  const advance = (d.terms ?? 'Advance') === 'Advance';
  const transporterNames = (field('transporter').options ?? []).map(v => field('transporter').optionLabels?.get(v) ?? v);

  return `<div class="order-top">
    ${card('details', 'Purchase Order Details', `<div class="order-grid three">
      ${readOnly('Location', doc.site)}
      <label><span>PO Date${star}</span><input name="day" type="date" data-required="true" max="${esc(actor.businessDay ?? doc.day)}" value="${esc(doc.day)}"></label>
      ${readOnly('PO No.', formatIndentNumber(doc.number) || '', 'placeholder="Auto-generated"')}
      ${input('deliveryDate', 'Delivery Date', { required: true, attrs: `min="${esc(doc.day)}"` })}
      <label class="span-two"><span>Indent No.${star}</span><select name="indent" data-required="true"><option value=""${d.indent || indents.length === 1 ? '' : ' selected'}>${indents.length ? 'Select…' : 'No approved indent with a balance'}</option>${indentOptions}</select></label>
      <label class="span-three"><span>Undersigned (Employee)${star}</span><input name="undersigned" type="text" data-required="true" maxlength="200" autocomplete="off" value="${esc(d.undersigned ?? employee)}"></label>
    </div>`, 'order')}
    ${card('vendor', 'Vendor Details', `${select('supplier', 'Party / Vendor Name', { required: true })}
      <div class="vendor-contact" data-accounts="${esc(JSON.stringify(meta.accountDetails ?? {}))}">${icon('<path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.800 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>')}
        <div><strong>Vendor's Address &amp; Contact</strong><p data-vendor-address>Select a vendor to see its address.</p><p data-vendor-contact></p></div></div>`)}
    <div class="order-stack">
    ${card('tax', 'Tax &amp; Supply', `<div class="order-grid three">${select('transactionType', 'Transaction Type', { required: true })}${select('supplyNature', 'Supply Nature', { required: true })}${select('type', 'PO Type', { required: true })}</div>`)}
    ${card('freight', 'Freight &amp; Logistics', `<div class="order-grid two">${select('depot', 'Lifting Location', { required: !field('depot').optional })}
      ${select('basis', 'Freight Type', { required: true, labels: { Delivered: 'Paid', 'Ex-depot': 'To Pay' } })}
      ${select('transporter', 'Transporter')}${input('freightContract', 'Freight Contract No.', { attrs: 'maxlength="100" autocomplete="off"' })}
      ${input('freightRate', 'Freight Rate (₹/L)')}
      <label class="order-check"><input type="checkbox" data-loading-gross${d.loadingOnGross === 'Yes' ? ' checked' : ''}><input type="hidden" name="loadingOnGross" value="${d.loadingOnGross === 'Yes' ? 'Yes' : 'No'}">Loading on Gross</label></div>`)}
    </div></div>
    <div class="order-record">${icons.layers}<strong>Record Information</strong>
      <span>Creation Date <b>${esc(stamp({ day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-'))}</b></span>
      <span>Creation Time <b>${esc(stamp({ hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase())}</b></span>
      <span>Created By <b>${esc(actor.employee?.name ?? actor.requestedBy ?? doc.role ?? '')}</b></span></div>
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
    ${card('footer', 'Final Calculation – Footer / Tax', `<div class="order-table"><table><thead><tr><th>Seq</th><th>Footer Head</th><th>Legend</th><th>Rate / %</th><th>Calculated On</th><th>Value (₹)</th></tr></thead><tbody>
      <tr><td>1</td><td>Basic Excise Duty</td><td><span class="legend">QQA</span></td><td><input name="exciseRate" type="number" step="any" min="0" inputmode="decimal" aria-label="Basic excise duty per litre" value="${esc(d.exciseRate ?? '')}"></td>
        <td><output data-order="exciseOn"></output></td><td><output data-order="excise"></output></td></tr>
      <tr><td>2</td><td>VAT[S]</td><td><span class="legend">PRA</span></td><td><input name="vatPercent" type="number" step="any" min="0" max="100" inputmode="decimal" aria-label="VAT percent" value="${esc(d.vatPercent ?? '')}"></td>
        <td><output data-order="vatBase"></output></td><td><output data-order="vat"></output></td></tr>
      <tr><td>3</td><td>Round Off (+/-)</td><td><span class="legend">LSA</span></td><td>—</td><td>—</td><td><output data-order="roundOff"></output></td></tr>
      </tbody></table></div>`, 'sum')}
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
    ${card('schedule', 'Delivery Schedule', `<p class="order-hint plain">Delivery rows must total the Diesel Qty. Each date must fall between the PO date and the delivery date.</p>
      <input type="hidden" name="deliveries" value="${esc(JSON.stringify(deliveries))}">
      <datalist id="order-transporters">${transporterNames.map(name => `<option value="${esc(name)}">`).join('')}</datalist>
      <div class="order-table"><table data-deliveries data-site="${esc(doc.site)}"><thead><tr><th>Delivery Date${star}</th><th>Location${star}</th><th>Delivery Address</th><th>DSL Qty (L)${star}</th><th>Vehicle No.</th><th>Transporter Name</th><th><span class="sr-only">Remove</span></th></tr></thead><tbody></tbody></table></div>
      <div class="order-schedule-foot"><button type="button" data-add-delivery>+ Add delivery row</button><output data-scheduled aria-live="polite"></output></div>`, 'truck')}`;
}
