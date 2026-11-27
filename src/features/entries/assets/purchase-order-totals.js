// Diesel purchase order arithmetic, shared by the server rules and the form so both always agree.
// Rates are ₹ per litre. Each footer head carries a legend that says how it is worked out:
//   LS lump sum · OQ rate × quantity · PR percent of the running total · PA percent of the basic amount,
//   ending in A to add or D to deduct. Round Off brings the PO amount to a whole rupee.
const paise = value => Math.round((value + Number.EPSILON) * 100) / 100;
const num = value => Number.isFinite(Number(value)) && value !== '' && value !== null && value !== undefined ? Number(value) : 0;

export const footerHeads = ['Basic Excise Duty', 'VAT', 'Cess', 'Discount', 'Round Off'];
export const footerLegends = ['LSA', 'LSD', 'OQA', 'OQD', 'PRA', 'PRD', 'PAA', 'PAD'];
export const defaultFooterRows = [{ head: 'Basic Excise Duty', legend: 'OQA' }, { head: 'VAT', legend: 'PRA' }, { head: 'Round Off', legend: 'LSA' }];

// The footer rows of an order: its own rows, or the excise and VAT an earlier order was saved with.
export function footerRowsOf(input) {
  // A draft keeps its rows as the text the form sent; a saved order keeps them as a list.
  let rows = input.footerRows;
  if (typeof rows === 'string') { try { rows = JSON.parse(rows); } catch { rows = null; } }
  if (Array.isArray(rows) && rows.length) return rows;
  return [{ ...defaultFooterRows[0], rate: input.exciseRate }, { ...defaultFooterRows[1], rate: input.vatPercent }, defaultFooterRows[2]];
}

// Freight is paid apart from the diesel on To Pay (Ex-depot) and To Bill orders.
export const freightAdded = basis => basis === 'Ex-depot' || basis === 'To Bill';

export function purchaseOrderTotals(input) {
  const litres = num(input.litres), rateAfter = num(input.rateAfter);
  const amount = paise(litres * rateAfter);
  let running = amount, excise = 0, vat = 0, vatBase, rounds = false;
  const rows = footerRowsOf(input).map(row => {
    const legend = footerLegends.includes(row.legend) ? row.legend : '';
    if (row.head === 'Round Off') {
      // A round off typed in is taken as it is, added or deducted by its legend. Left blank, the order is rounded to a whole rupee.
      if (row.rate !== undefined && row.rate !== null && row.rate !== '') {
        const value = paise(num(row.rate) * (legend.endsWith('D') ? -1 : 1));
        running = paise(running + value);
        return { head: row.head, legend, on: null, value, typed: true };
      }
      rounds = true; return { head: row.head, legend, round: true, on: null, value: 0 };
    }
    if (!row.head || !legend) return { head: row.head ?? '', legend, on: null, value: 0 };
    const rate = num(row.rate), kind = legend.slice(0, 2);
    const on = kind === 'OQ' ? litres : kind === 'PR' ? running : kind === 'PA' ? amount : null;
    const value = paise((kind === 'LS' ? rate : kind === 'OQ' ? litres * rate : on * rate / 100) * (legend.endsWith('D') ? -1 : 1));
    if (row.head === 'VAT') { vatBase ??= on ?? 0; vat = paise(vat + value); }
    if (row.head === 'Basic Excise Duty') excise = paise(excise + value);
    running = paise(running + value);
    return { head: row.head, legend, on, quantity: kind === 'OQ', value };
  });
  const total = rounds ? Math.round(running) : running;
  const roundOff = paise(total - running);
  for (const row of rows) if (row.round) { row.value = roundOff; break; }
  // Landed rate per litre is the order amount per litre plus the freight rate. On a To Pay or To Bill order the freight is
  // paid apart from the diesel; on FOR (Delivered) the price already includes delivery, so any freight rate typed is left out.
  const four = value => Math.round((value + Number.EPSILON) * 10000) / 10000;
  const dieselRate = litres > 0 ? four(total / litres) : 0;
  const freightRate = freightAdded(input.basis) ? num(input.freightRate) : 0;
  // An order that took its landed rate from the Diesel Rate Master shows that rate; otherwise it is worked out here.
  const fetched = num(input.landedRate);
  return { litres, netRate: rateAfter, amount, excise, vatBase: vatBase ?? paise(amount + excise), vat, roundOff, footer: paise(total - amount), total,
    landedRate: fetched > 0 ? four(fetched) : litres > 0 ? four(dieselRate + freightRate) : 0, dieselRate, freightRate, rows };
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
