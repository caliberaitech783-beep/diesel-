// Final templates v1.0: the worked-out rate is basic + excise, less an invoice discount, plus VAT on that value.
// A post-sale discount arrives later by credit note, so it stays out of the PO and bill rate.
export function dieselRate({ basic, excise, vatPercent, discount, discountType }) {
  const decimal = value => typeof value === 'number' || (typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value.trim()));
  const blank = value => value === undefined || value === null || String(value).trim() === '';
  if (!decimal(basic) || !decimal(excise) || !decimal(vatPercent) || (!blank(discount) && !decimal(discount))) return null;
  const reduction = blank(discount) ? 0 : Number(discount);
  if (reduction > 0 && !['Invoice discount', 'Post-sale discount'].includes(discountType)) return null;
  const invoiceDiscount = discountType === 'Invoice discount' ? reduction : 0;
  const beforeVat = Number(basic) + Number(excise) - invoiceDiscount;
  const vat = Number(vatPercent);
  if (!(Number(basic) > 0 && Number(excise) >= 0 && vat >= 0 && vat <= 100 && beforeVat > 0)) return null;
  // Rates are entered per litre, so the result keeps four decimals. The field is still called perKilolitre for older callers.
  const perKilolitre = Math.round((beforeVat * (1 + vat / 100) + Number.EPSILON) * 10000) / 10000;
  return Number.isFinite(perKilolitre) ? { beforeVat, perKilolitre, perLitre: perKilolitre / 1000 } : null;
}
