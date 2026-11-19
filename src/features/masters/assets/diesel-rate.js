import { dieselRate } from './diesel-rate-formula.mjs';

const control = key => document.querySelector('[data-field-key="' + key + '"]');
const inputs = { basic: control('basic-rate'), excise: control('excise-duty'), vatPercent: control('vat-percent'),
  discount: control('rate-discount'), discountType: control('rate-discount-type') };
const rate = control('worked-out-rate');
const note = document.getElementById(rate.getAttribute('aria-describedby'));
const instruction = note.textContent;
const format = new Intl.NumberFormat('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2});
function showDieselRate() {
  const result = dieselRate(Object.fromEntries(Object.entries(inputs).map(([name, input]) => [name, input.value])));
  rate.value = result ? String(result.perKilolitre) : '';
  note.textContent = result ? `₹${format.format(result.perLitre)}/L · ₹${format.format(result.perKilolitre)}/KL` : instruction;
}
for (const input of Object.values(inputs)) {
  input.addEventListener('input', showDieselRate);
  input.addEventListener('change', showDieselRate);
}
window.addEventListener('pageshow', showDieselRate);
showDieselRate();
