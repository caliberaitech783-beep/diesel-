// Diesel Dashboard: figures and charts for a period and a site, drawn from saved entries.
import { byId } from './catalog.mjs';
import { esc, option, page } from './entry-shell.mjs';
import { formatIndentNumber } from './indent-details.mjs';
import { dashboardFigures, period, presets, previousPeriod } from './dashboard-figures.mjs';
import { icons } from './workspace-map.mjs';

const tabs = [['overview', 'Overview', 'dashboard'], ['buy', 'Buy', 'buy'], ['receive', 'Receive', 'receive'], ['stock', 'Stock Storage', 'stock'],
  ['vehicle', 'Vehicle Fuel', 'fuel'], ['accounts', 'Accounts & Billing', 'accounts']];
const tabTypes = { overview: ['E7'], buy: ['E1', 'E2', 'E3', 'E4'], receive: ['E6', 'E7'], stock: ['E12', 'E10A', 'E10B', 'E10C', 'E14'], vehicle: ['E11'], accounts: ['E8', 'E9', 'E13'] };
const tones = { Posted: 'posted', Draft: 'draft', Returned: 'returned', Saved: 'waiting' };

const whole = value => Math.round(value).toLocaleString('en-IN');
const litres = value => value === null || value === undefined ? null : whole(value);
const rupees = value => '₹ ' + whole(value);
const dayText = day => day.split('-').reverse().join('-');

// Each card: label, value shown (null when there is nothing to work it out from), unit, note, and optionally a warning,
// the entry whose register the card opens, and the figure now and in the period before, to show the change.
function change(now, was) {
  if (typeof now !== 'number' || typeof was !== 'number' || now === was) return '';
  if (!was) return `<span class="kpi-change up" title="Nothing in the previous period">▲ new</span>`;
  const percent = Math.round((now - was) / was * 100);
  return `<span class="kpi-change ${percent >= 0 ? 'up' : 'down'}" title="Against the period just before">${percent >= 0 ? '▲' : '▼'} ${Math.abs(percent)}%</span>`;
}
const card = link => ({ label, value, unit = '', note, warn, type, now, was }) => {
  const inside = `<span class="kpi-label">${esc(label)}</span>
  <strong class="kpi-value">${value === null ? '—' : esc(value)}${value !== null && unit ? `<small>${esc(unit)}</small>` : ''}</strong><span class="kpi-note">${esc(value === null ? 'No data yet' : note)}${value === null ? '' : change(now, was)}</span>`;
  return type ? `<a class="kpi${warn ? ' warn' : ''}" href="${esc(link(type))}" title="Open these records">${inside}</a>` : `<div class="kpi${warn ? ' warn' : ''}">${inside}</div>`;
};

function cards(tab, f, p, link) {
  const o = f.overview, b = f.buy, r = f.receive, s = f.stock, v = f.vehicle, a = f.accounts;
  const stockNote = 'Sites with stock set up', shortageNote = o.shortagePercent === null ? 'Against invoice quantity' : o.shortagePercent + '% of invoice quantity';
  const cover = { label: 'Days of Cover', value: o.daysOfCover === null ? null : String(o.daysOfCover), unit: 'days', note: 'Closing stock ÷ avg daily issue', warn: o.daysOfCover !== null && o.daysOfCover < 5 };
  const shortage = { label: 'Shortage', value: litres(o.shortage), unit: 'L', note: shortageNote, warn: o.shortagePercent > 0.3, type: 'E7', now: o.shortage, was: p.overview.shortage };
  return ({
    overview: [{ label: 'Diesel Received', value: litres(o.received), unit: 'L', note: o.tankers + ' goods receipt notes', type: 'E7', now: o.received, was: p.overview.received },
      { label: 'Diesel Issued', value: litres(o.issued), unit: 'L', note: o.fuelEntries + ' fuel entries', type: 'E11', now: o.issued, was: p.overview.issued },
      { label: 'Closing Stock', value: litres(o.closing), unit: 'L', note: stockNote },
      { label: 'Purchase Value', value: rupees(o.orderValue), note: o.averageRate === null ? 'Approved purchase orders' : 'Avg rate ₹ ' + o.averageRate + ' / L', type: 'E2', now: o.orderValue, was: p.overview.orderValue },
      shortage, cover],
    buy: [{ label: 'Indents Raised', value: whole(b.indents), note: litres(b.indentLitres) + ' L requested', type: 'E1', now: b.indents, was: p.buy.indents },
      { label: 'Purchase Orders', value: whole(b.orders), note: b.approvedOrders + ' approved', type: 'E2', now: b.orders, was: p.buy.orders },
      { label: 'Ordered Qty', value: litres(b.ordered), unit: 'L', note: 'On approved purchase orders', type: 'E2', now: b.ordered, was: p.buy.ordered },
      { label: 'PO Value', value: rupees(b.orderValue), note: 'Approved purchase orders', type: 'E2', now: b.orderValue, was: p.buy.orderValue },
      { label: 'Payment Advices', value: whole(b.payments), note: rupees(b.paid) + ' posted', type: 'E3', now: b.payments, was: p.buy.payments },
      { label: 'Delivery Schedules', value: whole(b.schedules), note: litres(b.scheduled) + ' L scheduled', type: 'E4', now: b.schedules, was: p.buy.schedules }],
    receive: [{ label: 'GRNs Made', value: whole(r.grns), note: 'Posted goods receipt notes', type: 'E7', now: r.grns, was: p.receive.grns },
      { label: 'Qty Received', value: litres(r.received), unit: 'L', note: 'Accepted quantity', type: 'E7', now: r.received, was: p.receive.received },
      { label: 'Invoice Qty', value: litres(r.invoiced), unit: 'L', note: 'On supplier invoices', type: 'E7', now: r.invoiced, was: p.receive.invoiced },
      { label: 'Inspections', value: whole(r.inspections), note: 'Tankers inspected', type: 'E6', now: r.inspections, was: p.receive.inspections },
      shortage, { label: 'Received Value', value: rupees(r.value), note: 'Received quantity × rate', type: 'E7', now: r.value, was: p.receive.value }],
    stock: [{ label: 'Closing Stock', value: litres(s.closing), unit: 'L', note: stockNote }, { ...cover, note: 'At the current issue rate' },
      { label: 'Site to Site Transfers', value: whole(s.siteTransfers), note: 'In the selected period', type: 'E12', now: s.siteTransfers, was: p.stock.siteTransfers },
      { label: 'Internal Transfers', value: whole(s.internalTransfers), note: 'Tank and bowser movements', type: 'E10A', now: s.internalTransfers, was: p.stock.internalTransfers },
      { label: 'Retail Pump Purchases', value: whole(s.retail), note: 'In the selected period', type: 'E14', now: s.retail, was: p.stock.retail }],
    vehicle: [{ label: 'Diesel Issued', value: litres(v.issued), unit: 'L', note: 'To vehicles and equipment', type: 'E11', now: v.issued, was: p.vehicle.issued },
      { label: 'Fuel Entries', value: whole(v.fuelEntries), note: 'Individual fillings', type: 'E11', now: v.fuelEntries, was: p.vehicle.fuelEntries },
      { label: 'Avg per Entry', value: v.perEntry === null ? null : whole(v.perEntry), unit: 'L', note: 'Litres per filling' },
      { label: 'Avg Daily Issue', value: litres(v.perDay), unit: 'L', note: 'Over ' + f.days + ' day' + (f.days > 1 ? 's' : '') }],
    accounts: [{ label: 'Bills Booked', value: whole(a.bills), note: 'Supplier bills matched', type: 'E8', now: a.bills, was: p.accounts.bills },
      { label: 'Debit Notes & Freight Bills', value: whole(a.debitNotes), note: 'In the selected period', type: 'E9', now: a.debitNotes, was: p.accounts.debitNotes },
      { label: 'Contractor Recoveries', value: whole(a.recoveries), note: 'In the selected period', type: 'E13', now: a.recoveries, was: p.accounts.recoveries },
      { label: 'Payment Advices', value: whole(a.payments), note: rupees(a.paid) + ' posted', type: 'E3', now: a.payments, was: p.accounts.payments }],
  })[tab].map(card(link)).join('');
}

// Bars drawn as SVG shapes, so the page needs no script and no inline styling.
function barChart(points, series) {
  const top = Math.max(0, ...points.flatMap(point => series.map(([key]) => point[key])));
  if (!top) return '<p class="chart-empty">No data for this period</p>';
  const width = 720, height = 250, left = 56, bottom = 32, plot = height - bottom - 12, slot = (width - left - 8) / points.length;
  const bar = Math.max(2, Math.min(26, (slot - 6) / series.length)), every = Math.ceil(points.length / 12);
  const y = value => 12 + plot - value / top * plot;
  const grid = [0, .5, 1].map(part => `<line class="chart-grid" x1="${left}" x2="${width}" y1="${y(top * part)}" y2="${y(top * part)}"/>
    <text class="chart-axis" x="${left - 8}" y="${y(top * part) + 4}" text-anchor="end">${whole(top * part)}</text>`).join('');
  const bars = points.map((point, index) => {
    const x = left + index * slot + (slot - bar * series.length) / 2;
    return series.map(([key, name], place) => `<rect class="chart-bar series-${place}" x="${(x + place * bar).toFixed(1)}" y="${y(point[key]).toFixed(1)}" width="${(bar - 1).toFixed(1)}" height="${(point[key] / top * plot).toFixed(1)}" rx="2"><title>${esc(point.label)} · ${esc(name)}: ${whole(point[key])}</title></rect>`).join('')
      + (index % every ? '' : `<text class="chart-axis" x="${(left + index * slot + slot / 2).toFixed(1)}" y="${height - 10}" text-anchor="middle">${esc(point.label)}</text>`);
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(series.map(([, name]) => name).join(' and '))}">${grid}${bars}</svg>
    ${series.length > 1 ? `<p class="chart-legend">${series.map(([, name], place) => `<span class="series-${place}">${esc(name)}</span>`).join('')}</p>` : ''}`;
}

function recentTable(rows, sites) {
  if (!rows.length) return '<p class="chart-empty">No records in this period</p>';
  return `<div class="scroll"><table><thead><tr><th>Number</th><th>Entry</th>${sites ? '<th>Site</th>' : ''}<th>Date</th><th>Quantity (L)</th><th>Status</th></tr></thead><tbody>${rows.map(row => {
    const quantity = row.result?.accepted ?? row.result?.litres ?? row.data?.litres;
    return `<tr><td><a class="record-link" href="/entries/record/${esc(row.id)}">${esc(formatIndentNumber(row.number ?? '') || 'Draft')}</a></td><td>${esc(byId[row.type]?.name ?? row.type)}</td>
      ${sites ? `<td>${esc(row.site)}</td>` : ''}<td>${esc(dayText(row.day))}</td><td>${typeof quantity === 'number' ? whole(quantity) : '—'}</td>
      <td><span class="status-pill ${tones[row.status] ?? 'waiting'}">${esc(row.status)}</span></td></tr>`;
  }).join('')}</tbody></table></div>`;
}

const panel = (title, note, body, wide = '') => `<section class="dash-card${wide}"><h2>${esc(title)}</h2><p class="dash-note">${esc(note)}</p>${body}</section>`;

// sites: [[value, name]] this person may look at. rows already hold only the chosen sites' entries.
export function dashboardPage(actor, rows, query, { sites, site, stock, today, waiting }) {
  const range = period(query, today), tab = tabs.some(([id]) => id === query.tab) ? query.tab : 'overview';
  const figures = dashboardFigures(rows, range, stock), all = site === 'all';
  // The period of the same length just before, for the change shown on each card.
  const before = dashboardFigures(rows, previousPeriod(range));
  // A card opens that entry's register for the same dates. The register is the signed-in site's own.
  const register = type => '/entries/type/' + type + '?' + new URLSearchParams({ from: range.from, to: range.to });
  const work = waiting ? `<section class="dash-card span-3 dash-work"><h2>Waiting for you</h2><p class="dash-note">At ${esc(actor.site)}</p><div class="work-links">
      <a href="/entries/approvals"${waiting.approvals ? ' class="has-work"' : ''}><b>${waiting.approvals}</b>Approvals to give</a>
      <a href="/entries?status=Returned"${waiting.returned ? ' class="has-work"' : ''}><b>${waiting.returned}</b>Returned to you</a>
      <a href="/entries?status=Draft"><b>${waiting.drafts}</b>Your drafts</a></div></section>` : '';
  const shortcuts = '<section class="dash-card span-3 dash-shortcuts" id="dash-shortcuts" hidden><div><h2>Favourites</h2><ul id="favourite-pages"></ul></div><div><h2>Recently opened</h2><ul id="recent-records"></ul></div></section>';
  const link = change => '/entries/dashboard?' + new URLSearchParams({ tab, site, ...(range.preset ? { preset: range.preset } : { from: range.from, to: range.to }), ...change });
  const recent = tabTypes[tab].flatMap(type => figures.recent(type)).toSorted((a, b) => b.day.localeCompare(a.day)).slice(0, 8);
  const stockList = figures.stockBySite.length ? `<ul class="stock-bars">${figures.stockBySite.map(row => `<li><span>${esc(row.site)}</span><b>${whole(row.litres)} L</b>
    <progress max="${Math.max(1, figures.stockBySite[0].litres)}" value="${Math.max(0, row.litres)}">${whole(row.litres)} L</progress></li>`).join('')}</ul>`
    : '<p class="chart-empty">Stock shows here once a site\'s opening stock is set up</p>';
  const charts = tab === 'overview'
    ? panel('Diesel Received vs Issued', 'Litres, ' + figures.per, barChart(figures.trend, [['received', 'Received'], ['issued', 'Issued']]), ' span-2')
      + panel('Closing Stock by Site', 'As on ' + dayText(today), stockList)
      + panel('Purchase Value', '₹, ' + figures.per + ' · approved purchase orders', barChart(figures.trend, [['value', 'Purchase value']]), ' span-3')
    : tab === 'buy' ? panel('Purchase Value', '₹, ' + figures.per + ' · approved purchase orders', barChart(figures.trend, [['value', 'Purchase value']]), ' span-3')
    : tab === 'receive' ? panel('Diesel Received', 'Litres, ' + figures.per, barChart(figures.trend, [['received', 'Received']]), ' span-3')
    : tab === 'vehicle' ? panel('Diesel Issued', 'Litres, ' + figures.per, barChart(figures.trend, [['issued', 'Issued']]), ' span-3')
    : tab === 'stock' ? panel('Closing Stock by Site', 'As on ' + dayText(today), stockList, ' span-3') : '';
  const heading = `<div class="ws-heading"><h1>Diesel Dashboard</h1><p>${esc(dayText(range.from))} to ${esc(dayText(range.to))} · ${esc(all ? 'All sites' : site)}</p></div>`;
  const body = `<form class="dash-filter" method="get" action="/entries/dashboard"><input type="hidden" name="tab" value="${esc(tab)}">
      <div class="dash-presets" role="group" aria-label="Period">${presets(today).map(preset => `<a href="${esc(link({ preset: preset.id, from: '', to: '' }))}"${preset.id === range.preset ? ' aria-current="true"' : ''}>${esc(preset.label)}</a>`).join('')}</div>
      <label class="dash-range">From<input type="date" name="from" value="${esc(range.from)}" max="${esc(today)}"></label><label class="dash-range">To<input type="date" name="to" value="${esc(range.to)}" max="${esc(today)}"></label>
      <label class="dash-range">Site<select name="site">${option('all', 'All sites', all)}${sites.map(([value, name]) => option(value, name, value === site)).join('')}</select></label>
      <button class="primary">Show</button></form>
    <nav class="dash-tabs" aria-label="Dashboard sections">${tabs.map(([id, label, icon]) => `<a href="${esc(link({ tab: id }))}"${id === tab ? ' aria-current="page"' : ''}>${icons[icon]}<span>${esc(label)}</span></a>`).join('')}</nav>
    <div class="kpi-grid">${cards(tab, figures, before, register)}</div>
    <div class="dash-grid">${tab === 'overview' ? work + shortcuts : ''}${charts}${panel(tab === 'overview' ? 'Recent Goods Receipts' : 'Recent Records', recent.length ? 'Latest ' + recent.length + ' in the selected period' : 'In the selected period', recentTable(recent, all), ' span-3')}</div>`;
  return page('Diesel Dashboard', actor, 'dashboard', '/entries/dashboard', body, heading);
}
