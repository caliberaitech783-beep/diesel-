// Figures for the Diesel Dashboard, worked out from saved entries only. Nothing here is estimated:
// a figure with no entries behind it is zero, and stock is left empty when a site's stock is not set up.

const iso = date => date.toISOString().slice(0, 10);
const addDays = (day, days) => iso(new Date(Date.parse(day + 'T00:00:00Z') + days * 864e5));
const isDay = value => /^\d{4}-\d{2}-\d{2}$/.test(value ?? '');

// The financial year runs from 1 April.
export function financialYear(day) {
  const [year, month] = day.split('-').map(Number), start = month >= 4 ? year : year - 1;
  return { from: start + '-04-01', label: 'FY ' + start + '-' + String(start + 1).slice(2) };
}

export function presets(today) {
  const [year, month] = today.split('-').map(Number), quarter = Math.floor((month - 1) / 3) * 3 + 1;
  const two = value => String(value).padStart(2, '0'), year_ = financialYear(today);
  return [
    { id: 'today', label: 'Today', from: today }, { id: '7d', label: '7 Days', from: addDays(today, -6) },
    { id: '30d', label: '30 Days', from: addDays(today, -29) }, { id: 'month', label: 'This Month', from: year + '-' + two(month) + '-01' },
    { id: 'quarter', label: 'This Quarter', from: year + '-' + two(quarter) + '-01' }, { id: 'fy', label: year_.label, from: year_.from },
  ];
}

// The period asked for: a preset, or a custom from and to. Anything unreadable falls back to the last 30 days.
export function period(query, today) {
  const list = presets(today);
  if (isDay(query.from) && isDay(query.to) && query.from <= query.to && !query.preset) return { preset: '', from: query.from, to: query.to };
  const preset = list.find(row => row.id === query.preset) ?? list[2];
  return { preset: preset.id, from: preset.from, to: today };
}

// The period of the same length that ended the day before this one began.
export function previousPeriod({ from, to }) {
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1;
  return { from: addDays(from, -days), to: addDays(from, -1) };
}

const number = value => typeof value === 'number' && Number.isFinite(value) ? value : 0;
const total = (rows, pick) => Math.round(rows.reduce((sum, row) => sum + number(pick(row)), 0) * 100) / 100;

// One bar for each day, week or month, depending on how long the period is.
function buckets(from, to) {
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1, list = [];
  if (days <= 31) for (let day = from; day <= to; day = addDays(day, 1)) list.push({ from: day, to: day, label: day.slice(8) + '-' + day.slice(5, 7) });
  else if (days <= 120) for (let day = from; day <= to; day = addDays(day, 7)) {
    const end = addDays(day, 6) > to ? to : addDays(day, 6);
    list.push({ from: day, to: end, label: day.slice(8) + '-' + day.slice(5, 7) });
  } else for (let day = from; day <= to;) {
    const [year, month] = day.split('-').map(Number), next = month === 12 ? (year + 1) + '-01-01' : year + '-' + String(month + 1).padStart(2, '0') + '-01';
    const end = addDays(next, -1) > to ? to : addDays(next, -1);
    list.push({ from: day, to: end, label: new Date(day + 'T00:00:00Z').toLocaleString('en-IN', { month: 'short', timeZone: 'UTC' }) + ' ' + String(year).slice(2) });
    day = next;
  }
  return { list, per: days <= 31 ? 'daily' : days <= 120 ? 'weekly' : 'monthly', days };
}

// rows: saved entries of the chosen sites. stock: [{ site, litres, daily }] for sites whose stock is set up.
export function dashboardFigures(rows, { from, to }, stock = []) {
  const inPeriod = rows.filter(row => row.rev > 0 && row.day >= from && row.day <= to && !['Draft', 'Superseded'].includes(row.status));
  const of = type => inPeriod.filter(row => row.type === type);
  const posted = type => of(type).filter(row => row.status === 'Posted');
  const grns = posted('E7'), issues = posted('E11'), orders = posted('E2');
  const received = total(grns, row => row.result?.accepted), issued = total(issues, row => row.result?.litres ?? row.data?.litres);
  const invoiced = total(grns, row => row.result?.invoiceLitres), shortage = total(grns, row => row.result?.shortage);
  const ordered = total(orders, row => row.result?.litres), orderValue = total(orders, row => row.result?.value);
  const closing = stock.length ? total(stock, row => row.litres) : null, daily = total(stock, row => row.daily);
  const { list, per, days } = buckets(from, to);
  const between = (set, bucket, pick) => total(set.filter(row => row.day >= bucket.from && row.day <= bucket.to), pick);
  return {
    per, days,
    overview: { received, tankers: grns.length, issued, fuelEntries: issues.length, closing, orderValue,
      averageRate: ordered ? Math.round(orderValue / ordered * 100) / 100 : null, shortage,
      shortagePercent: invoiced ? Math.round(shortage / invoiced * 10000) / 100 : null,
      daysOfCover: closing !== null && daily > 0 ? Math.round(closing / daily * 10) / 10 : null },
    buy: { indents: of('E1').length, indentLitres: total(of('E1'), row => row.result?.requested ?? row.result?.litres), orders: of('E2').length, approvedOrders: orders.length,
      ordered, orderValue, payments: of('E3').length, paid: total(posted('E3'), row => row.result?.amount), schedules: of('E4').length,
      scheduled: total(posted('E4'), row => row.data?.litres) },
    receive: { grns: grns.length, received, invoiced, inspections: of('E6').length, shortage, value: total(grns, row => row.result?.value) },
    stock: { closing, siteTransfers: of('E12').length, internalTransfers: of('E10A').length + of('E10B').length + of('E10C').length, retail: of('E14').length },
    vehicle: { issued, fuelEntries: issues.length, perEntry: issues.length ? Math.round(issued / issues.length) : null, perDay: Math.round(issued / days) },
    accounts: { bills: of('E8').length, debitNotes: of('E9').length, recoveries: of('E13').length, payments: of('E3').length, paid: total(posted('E3'), row => row.result?.amount) },
    trend: list.map(bucket => ({ label: bucket.label, received: between(grns, bucket, row => row.result?.accepted),
      issued: between(issues, bucket, row => row.result?.litres ?? row.data?.litres), value: between(orders, bucket, row => row.result?.value) })),
    recent: type => of(type).toSorted((a, b) => (b.day + (b.updated ?? b.created ?? '')).localeCompare(a.day + (a.updated ?? a.created ?? ''))).slice(0, 8),
    stockBySite: stock.toSorted((a, b) => b.litres - a.litres),
  };
}
