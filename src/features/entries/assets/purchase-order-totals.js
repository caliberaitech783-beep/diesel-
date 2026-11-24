// Diesel purchase order arithmetic, shared by the server rules and the form so both always agree.
// Rates are ₹ per litre. Excise is charged per litre (QQA), VAT as a percentage of amount plus excise (PRA),
// and the round-off (LSA) brings the PO amount to a whole rupee.
const paise = value => Math.round((value + Number.EPSILON) * 100) / 100;
const num = value => Number.isFinite(Number(value)) && value !== '' && value !== null && value !== undefined ? Number(value) : 0;

export function purchaseOrderTotals(input) {
  const litres = num(input.litres), rateAfter = num(input.rateAfter), exciseRate = num(input.exciseRate), vatPercent = num(input.vatPercent);
  const amount = paise(litres * rateAfter);
  const excise = paise(litres * exciseRate);
  const vatBase = paise(amount + excise);
  const vat = paise(vatBase * vatPercent / 100);
  const beforeRound = paise(amount + excise + vat);
  const total = Math.round(beforeRound);
  const roundOff = paise(total - beforeRound);
  return { litres, netRate: rateAfter, amount, excise, vatBase, vat, roundOff, footer: paise(excise + vat + roundOff), total,
    landedRate: litres > 0 ? Math.round((total / litres + Number.EPSILON) * 10000) / 10000 : 0 };
}

const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen',
  'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const below100 = n => n < 20 ? ones[n] : tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
const below1000 = n => (n >= 100 ? ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' : '') : '') + below100(n % 100);

// Indian numbering: crore, lakh, thousand.
export function rupeesInWords(value) {
  const whole = Math.floor(num(value)), paiseLeft = Math.round((num(value) - whole) * 100);
  if (whole <= 0 && paiseLeft <= 0) return '';
  const parts = [];
  const crore = Math.floor(whole / 1e7), lakh = Math.floor(whole % 1e7 / 1e5), thousand = Math.floor(whole % 1e5 / 1000), rest = whole % 1000;
  if (crore) parts.push((crore >= 1000 ? rupeesInWords(crore).replace(/^Rupees | Only$/g, '') : below1000(crore)) + ' Crore');
  if (lakh) parts.push(below100(lakh) + ' Lakh');
  if (thousand) parts.push(below100(thousand) + ' Thousand');
  if (rest) parts.push(below1000(rest));
  return 'Rupees ' + (parts.join(' ') || 'Zero') + (paiseLeft ? ' and ' + below100(paiseLeft) + ' Paise' : '') + ' Only';
}
