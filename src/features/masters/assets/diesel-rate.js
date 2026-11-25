import { dieselRate } from './diesel-rate-formula.mjs';

const control = key => document.querySelector('[data-field-key="' + key + '"]');
const inputs = { basic: control('basic-rate'), excise: control('excise-duty'), vatPercent: control('vat-percent'),
  discount: control('rate-discount'), discountType: control('rate-discount-type') };
const rate = control('worked-out-rate'), transport = control('transport-rate'), landed = control('landed-cost'), net = control('net-landed-cost');
const note = document.getElementById(rate.getAttribute('aria-describedby'));
const instruction = note.textContent;
const format = new Intl.NumberFormat('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 4});
function showDieselRate() {
  const result = dieselRate(Object.fromEntries(Object.entries(inputs).map(([name, input]) => [name, input.value])));
  rate.value = result ? String(result.perKilolitre) : '';
  note.textContent = result ? `₹${format.format(result.perKilolitre)} per litre` : instruction;
  // Landed cost per litre is the worked-out rate plus the transportation rate.
  const carriage = Number(transport?.value || 0);
  const gross = result && carriage >= 0 ? Math.round((result.perKilolitre + carriage + Number.EPSILON) * 10000) / 10000 : null;
  if (landed) landed.value = gross === null ? '' : String(gross);
  // Net landed cost takes off a post-sale discount, which comes back later by credit note.
  const later = inputs.discountType.value === 'Post-sale discount' ? Number(inputs.discount.value || 0) : 0;
  if (net) net.value = gross === null ? '' : String(Math.round((gross - later + Number.EPSILON) * 10000) / 10000);
}
for (const input of [...Object.values(inputs), transport].filter(Boolean)) {
  input.addEventListener('input', showDieselRate);
  input.addEventListener('change', showDieselRate);
}
window.addEventListener('pageshow', showDieselRate);
showDieselRate();
