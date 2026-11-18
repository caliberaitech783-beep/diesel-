import { invoiceRate } from './invoice-rate.mjs';

const amount = document.querySelector('[data-field-key="invoice-total"]');
const litres = document.querySelector('[data-field-key="invoice-litres"]');
const rate = document.querySelector('[data-field-key="invoice-rate"]');
const note = document.getElementById(rate.getAttribute('aria-describedby'));
const instruction = note.textContent;
const format = new Intl.NumberFormat('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2});
function showInvoiceRate() {
  const result = invoiceRate(amount.value, litres.value);
  rate.value = result ? String(result.perKilolitre) : '';
  note.textContent = result ? `₹${format.format(result.perLitre)}/L · ₹${format.format(result.perKilolitre)}/KL` : instruction;
}
amount.addEventListener('input', showInvoiceRate);
litres.addEventListener('input', showInvoiceRate);
window.addEventListener('pageshow', showInvoiceRate);
showInvoiceRate();
