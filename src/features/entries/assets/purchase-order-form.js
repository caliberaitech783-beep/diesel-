// Live behaviour for the Diesel Purchase Order form: totals, searchable indent and vendor, and the payment toggle.
import { purchaseOrderTotals, rupeesInWords } from './purchase-order-totals.js';

const form = document.querySelector('#entry-form[data-type="E2"]');
if (form?.querySelector('[name="litres"]')) {
  const el = name => form.elements[name];
  const out = key => form.querySelector('[data-order="' + key + '"]');
  const rupee = value => '₹ ' + Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const plain = value => Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const systemFill = (control, value) => { control.value = value; control.dispatchEvent(new Event('change', { bubbles: true })); };

  // Footer rows are kept as JSON in one hidden field: the head, the legend and the rate of each row in use.
  const footRows = [...form.querySelectorAll('[data-footer-rows] tr')], footStore = el('footerRows');
  const part = (row, kind) => row.querySelector('[data-foot="' + kind + '"]');
  function readFooter() {
    return footRows.map(row => ({ head: part(row, 'head').value, legend: part(row, 'legend').value, rate: part(row, 'rate').value }));
  }
  function calculate() {
    const entered = readFooter();
    footStore.value = JSON.stringify(entered.filter(row => row.head).map(({ head, legend, rate }) => ({ head, legend, ...(rate === '' || head === 'Round Off' ? {} : { rate }) })));
    // Blank rows still take a place, so each result lines up with its row on the page.
    const t = purchaseOrderTotals({ litres: el('litres').value, rateAfter: el('rateAfter').value, footerRows: entered, basis: el('basis').value, freightRate: el('freightRate').value });
    out('netRate').textContent = t.netRate || '';
    out('amount').textContent = t.amount ? plain(t.amount) : '';
    out('landedRate').textContent = t.landedRate ? t.landedRate.toFixed(4) : '';
    footRows.forEach((row, index) => {
      const result = t.rows[index], used = Boolean(result?.head && result.legend);
      part(row, 'rate').disabled = result?.head === 'Round Off';
      if (result?.head === 'Round Off') part(row, 'rate').value = '';
      part(row, 'on').textContent = !used || result.on === null ? '—' : plain(result.on) + (result.quantity ? ' L' : '');
      part(row, 'value').textContent = used ? plain(result.value) : '—';
    });
    out('amountTotal').textContent = rupee(t.amount);
    out('footer').textContent = rupee(t.footer);
    out('total').textContent = rupee(t.total);
    out('landed').textContent = '₹ ' + t.landedRate.toFixed(4);
    out('words').textContent = rupeesInWords(t.total);
  }

  // Location, then site. The site list shows the sites under the chosen location; choosing a site reopens the form
  // for that site, so its indents are the ones offered.
  const place = form.querySelector('[data-order-location]'), siteBox = form.querySelector('[data-order-site]');
  if (place && siteBox) {
    const narrow = () => {
      for (const option of siteBox.options) if (option.value) option.hidden = option.disabled = Boolean(place.value) && option.dataset.location !== place.value;
      if (siteBox.selectedOptions[0]?.disabled) siteBox.value = '';
    };
    narrow();
    const opened = siteBox.value;
    place.addEventListener('change', narrow);
    siteBox.addEventListener('change', () => {
      if (!siteBox.value || siteBox.value === opened) return;
      const change = Object.assign(document.createElement('form'), { method: 'post', action: '/workspace/role', hidden: true });
      for (const [name, value] of [['site', siteBox.value], ['role', siteBox.dataset.role], ['returnTo', '/entries/new/E2']]) {
        change.append(Object.assign(document.createElement('input'), { type: 'hidden', name, value }));
      }
      document.body.append(change);
      change.submit();
    });
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

  for (const name of ['litres', 'rateBefore', 'rateAfter']) el(name).addEventListener('input', calculate);
  for (const row of footRows) { row.addEventListener('input', calculate); row.addEventListener('change', calculate); }
  // Footer rows are shown one at a time as they are needed.
  const addFooterRow = form.querySelector('[data-add-footer-row]');
  const moreRows = () => { addFooterRow.hidden = !footRows.some(row => row.hidden); };
  addFooterRow.addEventListener('click', () => {
    const next = footRows.find(row => row.hidden);
    if (next) { next.hidden = false; part(next, 'head').focus(); }
    moreRows();
  });
  moreRows();
  // The hidden footer field must be current before the shared form script reads it on submit.
  form.addEventListener('submit', calculate, true);
  el('supplier').addEventListener('change', showVendor);
  el('shortageMethod').addEventListener('change', shortage);
  el('basis').addEventListener('change', freight);
  // The landed rate takes in the freight rate on To Pay and To Bill orders.
  el('basis').addEventListener('change', calculate);
  el('freightRate').addEventListener('input', calculate);
  el('indent').addEventListener('change', indent);
  el('day').addEventListener('change', dates);
  showVendor(); shortage(); freight(); indent(); calculate();
}
