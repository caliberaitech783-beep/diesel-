// Live behaviour for the Diesel Purchase Order form: totals, searchable indent and vendor, and the payment toggle.
import { purchaseOrderTotals, rupeesInWords } from './purchase-order-totals.js';

const form = document.querySelector('#entry-form[data-type="E2"]');
if (form) {
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
  }

  // Vendor address and contact from the approved Account Master.
  const vendor = form.querySelector('.vendor-contact'), accounts = JSON.parse(vendor.dataset.accounts || '{}');
  function showVendor() {
    const details = accounts[el('supplier').value];
    vendor.querySelector('[data-vendor-address]').textContent = !el('supplier').value ? 'Select a vendor to see its address.'
      : details?.address || 'No address in the Account Master.';
    vendor.querySelector('[data-vendor-contact]').textContent = details?.contact ? '☎ ' + details.contact : '';
  }

  // Indent and vendor are typed into a search box. The hidden field takes the chosen record, or nothing
  // while the text matches no record, so a half-typed name is never saved.
  const chosen = {};
  for (const box of form.querySelectorAll('[data-search-for]')) {
    const hidden = el(box.dataset.searchFor), options = [...box.list.options];
    const pick = () => {
      const text = box.value.trim().toLowerCase();
      const match = options.find(option => option.value.toLowerCase() === text);
      chosen[box.dataset.searchFor] = match;
      box.setCustomValidity(text && !match ? 'Choose one from the list.' : '');
      if (hidden.value !== (match?.dataset.value ?? '')) { hidden.value = match?.dataset.value ?? ''; hidden.dispatchEvent(new Event('change', { bubbles: true })); }
    };
    box.addEventListener('input', pick); box.addEventListener('change', pick);
    chosen[box.dataset.searchFor] = options.find(option => option.dataset.value === hidden.value);
  }

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
    if (toPay) el('freightRate').dataset.required = 'true'; else delete el('freightRate').dataset.required;
  }
  // Choosing an indent suggests its remaining quantity.
  function indent() {
    const remaining = chosen.indent?.dataset.remaining;
    if (remaining && !el('litres').value) { systemFill(el('litres'), remaining); calculate(); }
  }
  function dates() {
    el('deliveryDate').min = el('day').value;
  }

  for (const name of ['litres', 'rateBefore', 'rateAfter', 'exciseRate', 'vatPercent']) el(name).addEventListener('input', calculate);
  el('supplier').addEventListener('change', showVendor);
  el('shortageMethod').addEventListener('change', shortage);
  el('basis').addEventListener('change', freight);
  el('indent').addEventListener('change', indent);
  el('day').addEventListener('change', dates);
  showVendor(); shortage(); freight(); indent(); calculate();
}
