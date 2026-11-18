export function invoiceRate(totalRupees, quantityLitres) {
  const decimal = value => typeof value === 'number' || (typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value.trim()));
  if (!decimal(totalRupees) || !decimal(quantityLitres)) return null;
  const amount = Number(totalRupees);
  const litres = Number(quantityLitres);
  if (!(amount > 0 && litres > 0 && Number.isFinite(amount) && Number.isFinite(litres))) return null;
  const perLitre = amount / litres;
  const perKilolitre = perLitre * 1000;
  return Number.isFinite(perKilolitre) ? { perLitre, perKilolitre } : null;
}
