// Live behaviour for the Diesel Purchase Order form: totals, vendor details, payment toggle and delivery rows.
import { purchaseOrderTotals, rupeesInWords } from './purchase-order-totals.js';

const form = document.querySelector('#entry-form[data-type="E2"]');
const table = form?.querySelector('[data-deliveries]');
if (form && table) {
  const el = name => form.elements[name];
  const out = key => form.querySelector('[data-order="' + key + '"]');
  const rupee = value => '₹ ' + Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const plain = value => Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const systemFill = (control, value) => { control.value = value; control.dispatchEvent(new Event('change', { bubbles: true })); };

  function calculate() {
    const t = purchaseOrderTotals({ litres: el('litres').value, rateAfter: el('rateAfter').value, exciseRate: el('exciseRate').value, vatPercent: el('vatPercent').value });
    out('netRate').textContent = t.netRate || '';
    out('amount').textContent = t.amount ? plain(t.amount) : '';
    out('landedRate').textContent = t.landedRate ? t.landedRate.toFixed(4) : '';
    out('exciseOn').textContent = t.litres ? plain(t.litres) + ' L' : '—';
    out('excise').textContent = plain(t.excise);
    out('vatBase').textContent = plain(t.vatBase);
    out('vat').textContent = plain(t.vat);
    out('roundOff').textContent = plain(t.roundOff);
    out('amountTotal').textContent = rupee(t.amount);
    out('footer').textContent = rupee(t.footer);
    out('total').textContent = rupee(t.total);
    out('landed').textContent = '₹ ' + t.landedRate.toFixed(4);
    out('words').textContent = rupeesInWords(t.total);
    schedule();
  }

  // Vendor address and contact from the approved Account Master.
  const vendor = form.querySelector('.vendor-contact'), accounts = JSON.parse(vendor.dataset.accounts || '{}');
  function showVendor() {
    const details = accounts[el('supplier').value];
    vendor.querySelector('[data-vendor-address]').textContent = !el('supplier').value ? 'Select a vendor to see its address.'
      : details?.address || 'No address in the Account Master.';
    vendor.querySelector('[data-vendor-contact]').textContent = details?.contact ? '☎ ' + details.contact : '';
  }

  // Delivery rows are kept as JSON in one hidden field.
  const body = table.tBodies[0], store = el('deliveries'), scheduled = form.querySelector('[data-scheduled]');
  const columns = [['date', 'date'], ['location', 'text'], ['address', 'text'], ['litres', 'number'], ['vehicle', 'text'], ['transporter', 'text']];
  function readRows() {
    return [...body.rows].map(row => Object.fromEntries(columns.map(([key]) => [key, row.querySelector('[data-col="' + key + '"]').value.trim()])
      .filter(([, value]) => value !== '')));
  }
  function schedule() {
    const rows = readRows();
    store.value = JSON.stringify(rows.filter(row => Object.keys(row).length));
    const total = rows.reduce((sum, row) => sum + (Number(row.litres) || 0), 0), wanted = Number(el('litres').value) || 0;
    scheduled.textContent = 'Scheduled total  ' + total.toLocaleString('en-IN') + ' / ' + wanted.toLocaleString('en-IN') + ' L' + (wanted && total === wanted ? '  ✓' : '');
    scheduled.dataset.state = wanted && total === wanted ? 'ok' : 'warn';
  }
  function addRow(values = {}) {
    const row = body.insertRow();
    for (const [key, type] of columns) {
      const input = Object.assign(document.createElement('input'), { type, value: values[key] ?? '' });
      input.dataset.col = key;
      input.setAttribute('aria-label', table.tHead.rows[0].cells[row.cells.length].textContent.replace('*', '').trim());
      if (type === 'number') Object.assign(input, { step: 'any', min: '0', inputMode: 'decimal' });
      if (key === 'date') { input.min = el('day').value; input.max = el('deliveryDate').value; }
      if (key === 'vehicle') { input.placeholder = 'MH34BZ4428'; input.style.textTransform = 'uppercase'; }
      if (key === 'transporter') input.setAttribute('list', 'order-transporters');
      row.insertCell().append(input);
    }
    const remove = Object.assign(document.createElement('button'), { type: 'button', textContent: '✕', title: 'Remove this delivery row' });
    remove.setAttribute('aria-label', 'Remove this delivery row');
    remove.addEventListener('click', () => { row.remove(); schedule(); });
    row.insertCell().append(remove);
  }
  function newRow() {
    const left = (Number(el('litres').value) || 0) - readRows().reduce((sum, row) => sum + (Number(row.litres) || 0), 0);
    const transporter = el('transporter').selectedOptions[0];
    addRow({ date: el('deliveryDate').value, location: table.dataset.site, litres: left > 0 ? left : '',
      transporter: transporter?.value ? transporter.textContent : '' });
    schedule();
  }
  for (const row of JSON.parse(store.value || '[]')) addRow(row);
  if (!body.rows.length) newRow();
  form.querySelector('[data-add-delivery]').addEventListener('click', newRow);
  body.addEventListener('input', schedule);

  // Payment: Yes means the full payment is an advance.
  const terms = el('terms');
  for (const button of form.querySelectorAll('[data-terms]')) button.addEventListener('click', () => {
    terms.value = button.dataset.terms;
    for (const other of form.querySelectorAll('[data-terms]')) other.setAttribute('aria-pressed', String(other === button));
    el('advanceAmount').disabled = terms.value !== 'Advance';
    if (terms.value !== 'Advance') el('advanceAmount').value = '';
  });
  el('advanceAmount').disabled = terms.value !== 'Advance';

  const gross = form.querySelector('[data-loading-gross]');
  gross.addEventListener('change', () => { el('loadingOnGross').value = gross.checked ? 'Yes' : 'No'; });

  function shortage() {
    const needed = ['Percent', 'Fixed'].includes(el('shortageMethod').value), rate = el('freightDeductionRate');
    rate.disabled = !needed;
    rate.placeholder = needed ? (el('shortageMethod').value === 'Percent' ? 'Percent of rate' : '₹ per litre') : 'Not required';
    if (needed) rate.dataset.required = 'true'; else { delete rate.dataset.required; rate.value = ''; }
  }
  function freight() {
    const toPay = el('basis').value === 'Ex-depot';
    for (const name of ['transporter', 'freightRate']) {
      if (toPay || (name === 'transporter' && el('shortageFrom').value === 'Transporter')) el(name).dataset.required = 'true';
      else delete el(name).dataset.required;
    }
  }
  // Choosing an indent suggests its remaining quantity.
  function indent() {
    const remaining = el('indent').selectedOptions[0]?.dataset.remaining;
    if (remaining && !el('litres').value) { systemFill(el('litres'), remaining); calculate(); }
  }
  function dates() {
    el('deliveryDate').min = el('day').value;
    for (const input of body.querySelectorAll('[data-col="date"]')) { input.min = el('day').value; input.max = el('deliveryDate').value; }
  }

  for (const name of ['litres', 'rateBefore', 'rateAfter', 'exciseRate', 'vatPercent']) el(name).addEventListener('input', calculate);
  el('supplier').addEventListener('change', showVendor);
  el('shortageMethod').addEventListener('change', shortage);
  el('shortageFrom').addEventListener('change', freight);
  el('basis').addEventListener('change', freight);
  el('indent').addEventListener('change', indent);
  el('day').addEventListener('change', dates);
  el('deliveryDate').addEventListener('change', dates);
  // The hidden delivery field must be current before the shared form script reads it on submit.
  form.addEventListener('submit', schedule, true);
  showVendor(); shortage(); freight(); indent(); calculate();
}
