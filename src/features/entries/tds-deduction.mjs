import { effectiveRecord } from './site-commercial.mjs';

const normalized = value => String(value ?? '').trim().normalize('NFKC').toLowerCase().replace(/\s+/g,' ');
const amount = value => value===undefined || value==='' ? NaN : Number(value);
const cents = value => Math.round((value + Number.EPSILON) * 100) / 100;

export const financialYearStart = day => Number(day.slice(0,4))-(day.slice(5,7)<'04'?1:0)+'-04-01';

// Approved Tax Master (TDS) rows. "Applies to" names freight, diesel purchase, or both.
export function tdsRules(records) {
  return records.flatMap(({ id, revision, values:v }) => {
    const applies = normalized(v['Applies to (freight, diesel purchase)']);
    const kinds = [/freight/.test(applies) && 'freight', /diesel|purchase/.test(applies) && 'purchase'].filter(Boolean);
    const single = amount(v['Threshold: single payment (₹)']), aggregate = amount(v['Threshold: aggregate in the year (₹)']);
    const withPan = amount(v['Rate with PAN (%)']), withoutPan = amount(v['Rate without PAN (%)']);
    if (!kinds.length || ![single,aggregate,withPan,withoutPan].every(value=>Number.isFinite(value)&&value>=0) || withPan>100 || withoutPan>100) return [];
    return [{ id, revision, kinds, single, aggregate, withPan, withoutPan, section:v['Section of Income-tax Act'],
      names:[v['Tax Section Code'],v['Tax Section Name'],v['Section of Income-tax Act'],v['Nature of payment']].map(normalized),
      payee:normalized(v['Payee category']), from:v['Effective from'], to:v['Effective to'] }];
  });
}

export function tdsRuleFor(rules, account, kind, day) {
  return effectiveRecord(rules ?? [], day, rule => rule.kinds.includes(kind)
    && rule.payee===normalized(account.tdsPayee) && rule.names.includes(normalized(account.tdsNature)));
}

// Purchase: tax only the value above the yearly limit, unless the account is liable from the first day.
// Freight: once a single bill or the year's total passes its limit, tax the bill and any earlier untaxed freight.
export function calculatedDeduction({ rule, account, kind, base, priorBase = 0, priorUntaxed = 0 }) {
  let taxable;
  if (kind==='purchase') taxable = account.tdsFromFirstDay ? base : Math.min(base,Math.max(0,priorBase+base-rule.aggregate));
  else {
    const yearly = priorBase+base>rule.aggregate;
    taxable = yearly ? base+priorUntaxed : base>rule.single ? base : 0;
  }
  const rate = account.pan ? rule.withPan : rule.withoutPan;
  return { tds:cents(taxable*rate/100), tdsBase:cents(taxable), tdsRate:rate, tdsSection:rule.section,
    tdsPan:account.pan?'PAN on record':'No PAN on record', tdsRuleRef:rule.id, tdsRuleRevision:rule.revision };
}
