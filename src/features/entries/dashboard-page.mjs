// Diesel Dashboard: figures and charts for a period and a site, drawn from saved entries.
import { byId } from './catalog.mjs';
import { esc, option, page } from './entry-shell.mjs';
import { formatIndentNumber } from './indent-details.mjs';
import { dashboardFigures, period, presets } from './dashboard-figures.mjs';
import { icons } from './workspace-map.mjs';

const tabs = [['overview', 'Overview', 'dashboard'], ['buy', 'Buy', 'buy'], ['receive', 'Receive', 'receive'], ['stock', 'Stock Storage', 'stock'],
  ['vehicle', 'Vehicle Fuel', 'fuel'], ['accounts', 'Accounts & Billing', 'accounts']];
const tabTypes = { overview: ['E7'], buy: ['E1', 'E2', 'E3', 'E4'], receive: ['E6', 'E7'], stock: ['E12', 'E10A', 'E10B', 'E10C', 'E14'], vehicle: ['E11'], accounts: ['E8', 'E9', 'E13'] };
const tones = { Posted: 'posted', Draft: 'draft', Returned: 'returned', Saved: 'waiting' };

const whole = value => Math.round(value).toLocaleString('en-IN');
const litres = value => value === null || value === undefined ? null : whole(value);
const rupees = value => '₹ ' + whole(value);
const dayText = day => day.split('-').reverse().join('-');

// value null means there is nothing to work the figure out from yet.
const card = ([label, value, unit, note, warn]) => `<div class="kpi${warn ? ' warn' : ''}"><span class="kpi-label">${esc(label)}</span>
  <strong class="kpi-value">${value === null ? '—' : esc(value)}${value !== null && unit ? `<small>${esc(unit)}</small>` : ''}</strong><span class="kpi-note">${esc(value === null ? 'No data yet' : note)}</span></div>`;

function cards(tab, f) {
  const o = f.overview, b = f.buy, r = f.receive, s = f.stock, v = f.vehicle, a = f.accounts;
  const stockNote = 'Sites with stock set up', shortageNote = o.shortagePercent === null ? 'Against invoice quantity' : o.shortagePercent + '% of invoice quantity';
  return ({
    overview: [['Diesel Received', litres(o.received), 'L', o.tankers + ' goods receipt notes'], ['Diesel Issued', litres(o.issued), 'L', o.fuelEntries + ' fuel entries'],
      ['Closing Stock', litres(o.closing), 'L', stockNote], ['Purchase Value', rupees(o.orderValue), '', o.averageRate === null ? 'Approved purchase orders' : 'Avg rate ₹ ' + o.averageRate + ' / L'],
      ['Shortage', litres(o.shortage), 'L', shortageNote, o.shortagePercent > 0.3], ['Days of Cover', o.daysOfCover === null ? null : String(o.daysOfCover), 'days', 'Closing stock ÷ avg daily issue', o.daysOfCover !== null && o.daysOfCover < 5]],
    buy: [['Indents Raised', whole(b.indents), '', litres(b.indentLitres) + ' L requested'], ['Purchase Orders', whole(b.orders), '', b.approvedOrders + ' approved'],
      ['Ordered Qty', litres(b.ordered), 'L', 'On approved purchase orders'], ['PO Value', rupees(b.orderValue), '', 'Approved purchase orders'],
      ['Payment Advices', whole(b.payments), '', rupees(b.paid) + ' posted'], ['Delivery Schedules', whole(b.schedules), '', litres(b.scheduled) + ' L scheduled']],
    receive: [['GRNs Made', whole(r.grns), '', 'Posted goods receipt notes'], ['Qty Received', litres(r.received), 'L', 'Accepted quantity'], ['Invoice Qty', litres(r.invoiced), 'L', 'On supplier invoices'],
      ['Inspections', whole(r.inspections), '', 'Tankers inspected'], ['Shortage', litres(r.shortage), 'L', shortageNote, o.shortagePercent > 0.3], ['Received Value', rupees(r.value), '', 'Received quantity × rate']],
    stock: [['Closing Stock', litres(s.closing), 'L', stockNote], ['Days of Cover', o.daysOfCover === null ? null : String(o.daysOfCover), 'days', 'At the current issue rate', o.daysOfCover !== null && o.daysOfCover < 5],
      ['Site to Site Transfers', whole(s.siteTransfers), '', 'In the selected period'], ['Internal Transfers', whole(s.internalTransfers), '', 'Tank and bowser movements'], ['Retail Pump Purchases', whole(s.retail), '', 'In the selected period']],
    vehicle: [['Diesel Issued', litres(v.issued), 'L', 'To vehicles and equipment'], ['Fuel Entries', whole(v.fuelEntries), '', 'Individual fillings'],
      ['Avg per Entry', v.perEntry === null ? null : whole(v.perEntry), 'L', 'Litres per filling'], ['Avg Daily Issue', litres(v.perDay), 'L', 'Over ' + f.days + ' day' + (f.days > 1 ? 's' : '')]],
    accounts: [['Bills Booked', whole(a.bills), '', 'Supplier bills matched'], ['Debit Notes & Freight Bills', whole(a.debitNotes), '', 'In the selected period'],
      ['Contractor Recoveries', whole(a.recoveries), '', 'In the selected period'], ['Payment Advices', whole(a.payments), '', rupees(a.paid) + ' posted']],
  })[tab].map(card).join('');
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
export function dashboardPage(actor, rows, query, { sites, site, stock, today }) {
  const range = period(query, today), tab = tabs.some(([id]) => id === query.tab) ? query.tab : 'overview';
  const figures = dashboardFigures(rows, range, stock), all = site === 'all';
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
    <div class="kpi-grid">${cards(tab, figures)}</div>
    <div class="dash-grid">${charts}${panel(tab === 'overview' ? 'Recent Goods Receipts' : 'Recent Records', recent.length ? 'Latest ' + recent.length + ' in the selected period' : 'In the selected period', recentTable(recent, all), ' span-3')}</div>`;
  return page('Diesel Dashboard', actor, 'dashboard', '/entries/dashboard', body, heading);
}
