// Picks the Diesel Rate Master record a purchase order takes its rates from. Shared by the form and the server.
// A record fits when its supplier is the order's vendor, its location is the order's location (or it names none)
// and the PO date falls within its effective dates. When a vendor has several depots, the lifting location chooses.
const same = (first, second) => String(first ?? '').trim().toLowerCase() === String(second ?? '').trim().toLowerCase();
const within = (text, part) => Boolean(String(part ?? '').trim()) && String(text ?? '').trim().toLowerCase().includes(String(part).trim().toLowerCase());

export function pickRate(rates, { supplier, location, depot, day }) {
  if (!supplier) return { rate: null, reason: '' };
  const ofVendor = (rates ?? []).filter(rate => same(rate.supplier, supplier));
  if (!ofVendor.length) return { rate: null, reason: 'No rate in Diesel Rate Master for this vendor. Enter the rates by hand.' };
  const here = ofVendor.filter(rate => !rate.location || !location || same(rate.location, location));
  if (!here.length) return { rate: null, reason: 'No rate in Diesel Rate Master for this vendor at ' + location + '. Enter the rates by hand.' };
  const dated = here.filter(rate => (!rate.from || !day || rate.from <= day) && (!rate.to || !day || day <= rate.to));
  if (!dated.length) return { rate: null, reason: 'The Diesel Rate Master has no rate for this vendor valid on the PO date. Enter the rates by hand.' };
  const depots = [...new Set(dated.map(rate => String(rate.depot ?? '').trim()))];
  let chosen = dated;
  if (depots.length > 1) {
    chosen = dated.filter(rate => same(rate.depot, depot) || within(depot, rate.depot));
    if (!chosen.length) return { rate: null, depots, reason: 'This vendor has rates for ' + depots.join(' and ') + '. Enter one of them as the Lifting Location to bring in its rates.' };
  }
  // The latest rate in force wins.
  return { rate: [...chosen].sort((first, second) => String(second.from ?? '').localeCompare(String(first.from ?? '')))[0], reason: '' };
}

// What the order takes from the record. Landed rate is the gross landed cost, or the net one when Landing on Gross is off.
export function ratesFor(rate, { gross = true } = {}) {
  if (!rate) return null;
  const number = value => value === undefined || value === null || value === '' || !Number.isFinite(Number(value)) ? undefined : Number(value);
  // Net Rate is the basic rate: excise and VAT are added on the order as footer heads. A shortage is deducted at the full diesel rate.
  return { netRate: number(rate.basic) ?? number(rate.diesel), freightRate: number(rate.freight), freightDeductionRate: number(rate.diesel),
    landedRate: gross ? number(rate.gross) : number(rate.net) ?? number(rate.gross) };
}
