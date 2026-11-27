import assert from 'node:assert/strict';
import test from 'node:test';
import { dashboardFigures, period, presets } from './dashboard-figures.mjs';
import { dashboardPage } from './dashboard-page.mjs';
import { workspaceFor } from './workspace-map.mjs';
import { workspacePage } from './workspace-page.mjs';
import { masterSidebar } from '../masters/master-sidebar.mjs';

const actor = { id: 'Jayant-buyer', site: 'Jayant', profile: 'procurement-executive' };
const row = (type, day, status, result = {}, data = {}) => ({ id: type + day + status, type, day, status, rev: 1, site: 'Jayant', number: type + '-1', result, data });

test('the workspace groups every menu entry under the department headings and keeps gate entry off it', () => {
  const list = workspaceFor(actor);
  assert.deepEqual(list.map(category => category.name), ['BUY', 'RECEIVE', 'STOCK STORAGE MANAGEMENT', 'VEHICLE FUEL ENTRY', 'ACCOUNTS & BILLING', 'CONTROL']);
  assert.deepEqual(list[0].modules.map(module => module.id), ['E1', 'E2', 'E3', 'E4']);
  assert.deepEqual(list[1].modules.map(module => module.id), ['E6', 'E7']);
  const placed = list.flatMap(category => category.modules.map(module => module.id));
  assert.equal(new Set(placed).size, placed.length);
  assert.ok(!placed.includes('E5') && placed.length === 18, 'every entry except the gate entry has one place');
  const html = workspacePage(actor, [row('E2', '2026-11-27', 'Posted'), row('E2', '2026-11-26', 'Draft')], { category: 'buy' });
  assert.match(html, /<h1>Diesel Workspace<\/h1>/);
  assert.match(html, /href="\/entries\/type\/E2">[\s\S]*?<b>Purchase order<\/b>[\s\S]*?<em>2 records<\/em>/);
  assert.match(html, /href="\/entries\/workspace\?category=receive"/);
  // The menu and the search box reach the new pages from any entry page.
  for (const part of ['href="/entries/dashboard"', 'href="/entries/workspace" aria-current="page"', 'href="/master-data"', 'id="global-search"', 'Entry register'])
    assert.ok(html.includes(part), part);
  assert.match(workspacePage(actor, [], { category: 'accounts' }), /<h2>ACCOUNTS &amp; BILLING<\/h2>/);
});

test('dashboard periods follow the presets, a custom range and the April financial year', () => {
  assert.deepEqual(presets('2026-11-27').map(preset => [preset.label, preset.from]), [['Today', '2026-11-27'], ['7 Days', '2026-11-21'], ['30 Days', '2026-10-29'],
    ['This Month', '2026-11-01'], ['This Quarter', '2026-10-01'], ['FY 2026-27', '2026-04-01']]);
  assert.equal(presets('2026-02-10')[5].from, '2025-04-01');
  assert.deepEqual(period({}, '2026-11-27'), { preset: '30d', from: '2026-10-29', to: '2026-11-27' });
  assert.deepEqual(period({ from: '2026-11-01', to: '2026-11-05' }, '2026-11-27'), { preset: '', from: '2026-11-01', to: '2026-11-05' });
  assert.equal(period({ from: '2026-11-09', to: '2026-11-05' }, '2026-11-27').preset, '30d');
});

test('dashboard figures come only from saved entries in the period', () => {
  const rows = [
    row('E2', '2026-11-20', 'Posted', { litres: 20000, value: 1800000 }), row('E2', '2026-11-21', 'Awaiting approval', { litres: 9000, value: 800000 }),
    row('E2', '2026-10-01', 'Posted', { litres: 5000, value: 450000 }), row('E2', '2026-11-22', 'Draft', { litres: 1, value: 1 }),
    row('E7', '2026-11-22', 'Posted', { accepted: 19900, invoiceLitres: 20000, shortage: 100, value: 1791000 }),
    row('E11', '2026-11-23', 'Posted', { litres: 300 }), row('E11', '2026-11-24', 'Posted', { litres: 500 }), row('E1', '2026-11-19', 'Posted', { litres: 21000, requested: 20000 }),
    row('E4', '2026-11-21', 'Posted', {}, { litres: 20000 }),
  ];
  const figures = dashboardFigures(rows, { from: '2026-11-18', to: '2026-11-27' });
  assert.deepEqual(figures.overview, { received: 19900, tankers: 1, issued: 800, fuelEntries: 2, closing: null, orderValue: 1800000, averageRate: 90, shortage: 100, shortagePercent: 0.5, daysOfCover: null });
  assert.deepEqual([figures.buy.indents, figures.buy.indentLitres, figures.buy.orders, figures.buy.approvedOrders, figures.buy.ordered, figures.buy.scheduled], [1, 20000, 2, 1, 20000, 20000]);
  assert.deepEqual([figures.vehicle.perEntry, figures.vehicle.perDay, figures.per, figures.trend.length], [400, 80, 'daily', 10]);
  assert.deepEqual(figures.trend.find(point => point.label === '22-11'), { label: '22-11', received: 19900, issued: 0, value: 0 });
  const stocked = dashboardFigures(rows, { from: '2026-11-18', to: '2026-11-27' }, [{ site: 'Jayant', litres: 40000, daily: 8000 }]);
  assert.deepEqual([stocked.overview.closing, stocked.overview.daysOfCover], [40000, 5]);
  assert.equal(dashboardFigures(rows, { from: '2026-04-01', to: '2026-11-27' }).per, 'monthly');

  const html = dashboardPage(actor, rows, { preset: '30d' }, { sites: [['Jayant', 'Jayant OC']], site: 'all', stock: [], today: '2026-11-27' });
  for (const part of ['<h1>Diesel Dashboard</h1>', 'Diesel Received', '19,900', '₹ 18,00,000', 'Avg rate ₹ 90 / L', 'No data yet', 'Closing Stock by Site', 'class="chart"', 'Recent Goods Receipts', 'All sites'])
    assert.ok(html.includes(part), part);
  assert.ok(!html.includes(' style='), 'the page keeps to the no-inline-style rule');
  const buy = dashboardPage(actor, rows, { tab: 'buy', site: 'Jayant' }, { sites: [['Jayant', 'Jayant OC']], site: 'Jayant', stock: [], today: '2026-11-27' });
  assert.ok(buy.includes('Indents Raised') && buy.includes('Delivery Schedules') && buy.includes('Recent Records'));
});

test('the masters menu opens the Dashboard, the Workspace and Master Data from its top links', () => {
  const html = masterSidebar({ masterData: true, masterDataCurrent: true, pulseMasters: true });
  assert.match(html, /<div class="main-links"><a href="\/entries\/dashboard">.*Dashboard<\/a>\s*<a href="\/entries\/workspace">.*Diesel Workspace<\/a>\s*<a href="\/master-data" aria-current="page">.*Diesel Master Data<\/a><\/div>/s);
  assert.ok(!masterSidebar({}).includes('main-links'));
});
