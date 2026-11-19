export function siteToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

export function validateDraft({ quantity, requiredBy, remarks }, today = siteToday()) {
  if (typeof quantity !== 'string' || !/^\d+(\.\d+)?$/.test(quantity)
    || !(Number(quantity) > 0) || !Number.isFinite(Number(quantity))) return 'Enter a requested quantity greater than zero litres.';
  if (typeof requiredBy !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(requiredBy)
    || !Number.isFinite(Date.parse(requiredBy)) || new Date(requiredBy).toISOString().slice(0, 10) !== requiredBy
    || requiredBy < today) return 'Choose today or a later date for delivery.';
  if (typeof remarks !== 'string' || remarks.length > 2000) return 'Keep remarks within 2,000 characters.';
  return '';
}
