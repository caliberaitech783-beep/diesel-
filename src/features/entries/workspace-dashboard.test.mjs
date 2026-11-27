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
  assert.match(html, /<div class="main-links"><a href="\/entries\/dashboard">.*Dashboard<\/a>\s*<a href="\/entries\/workspace">.*Diesel Workspace<\/a>\s*<a href="\/master-data" aria-current="page">.*Diesel Master Data<\/a>\s*<a href="\/master-insights\?view=checks">.*Data review<\/a><\/div>/s);
  // The short menu: no list of masters and no separate Master list, only the approver lists below the main links.
  assert.ok(!html.includes('master-data-list') && !html.includes('master-list') && !html.includes('master-search'));
  assert.match(html, /<summary>.*Approvers<\/summary><ul aria-label="Approver lists"><li><a href="\/indent-approvers">Indent approvers<\/a><\/li><li><a href="\/po-approvers">PO approvers<\/a><\/li><\/ul>/);
  // The local workspace has no cards page, so its menu still lists every master.
  assert.ok(masterSidebar({ masterData: true }).includes('id="master-data-list"') && masterSidebar({}).includes('id="master-list"'));
  assert.ok(!masterSidebar({}).includes('main-links'));
});

test('the search box finds saved entries by number, supplier or vehicle', async () => {
  const { searchRecords, pendingWork } = await import('./record-search.mjs');
  const rows = [
    { ...row('E2', '2026-11-20', 'Posted', { supplier: 'SANDEEP GASOLENES' }), number: 'CMLL/CNG/PO/26-27/002' },
    { ...row('E4', '2026-11-21', 'Posted', { vehicle: 'MH34BZ4330' }, { transporter: 'ASHOK ROADWAYS' }), number: 'E4-LAL-2026-0001' },
    { ...row('E2', '2026-11-22', 'Draft'), number: '', rev: 0 },
  ];
  assert.deepEqual(searchRecords(rows, 'mh34').map(found => found.number), ['E4-LAL-2026-0001']);
  assert.deepEqual(searchRecords(rows, 'sandeep po').map(found => [found.name, found.href]), [['Purchase order', '/entries/record/E22026-11-20Posted']]);
  assert.match(searchRecords(rows, 'ashok')[0].detail, /Jayant · ASHOK ROADWAYS · MH34BZ4330 · Posted/);
  assert.deepEqual([searchRecords(rows, 'x'), searchRecords(rows, ''), searchRecords(rows, 'nothing here')], [[], [], []]);
  const mine = [{ ...row('E2', '2026-11-20', 'Returned'), maker: actor.id }, { ...row('E2', '2026-11-21', 'Draft'), maker: actor.id },
    { ...row('E1', '2026-11-21', 'Saved'), maker: 'someone', decide: { id: 1 } }, { ...row('E2', '2026-11-22', 'Returned'), maker: 'someone' }];
  assert.deepEqual(pendingWork(mine, actor), { approvals: 1, returned: 1, drafts: 1, total: 2 });
});

test('dashboard cards open their records and show the change from the period before', () => {
  const rows = [row('E2', '2026-11-20', 'Posted', { litres: 20000, value: 1800000 }), row('E2', '2026-11-10', 'Posted', { litres: 10000, value: 900000 })];
  const html = dashboardPage(actor, rows, { from: '2026-11-18', to: '2026-11-27' }, { sites: [['Jayant', 'Jayant OC']], site: 'all', stock: [], today: '2026-11-27',
    waiting: { approvals: 2, returned: 0, drafts: 1, total: 2 } });
  assert.match(html, /<a class="kpi" href="\/entries\/type\/E2\?from=2026-11-18&amp;to=2026-11-27" title="Open these records"><span class="kpi-label">Purchase Value<\/span>/);
  assert.match(html, /class="kpi-change up" title="Against the period just before">▲ 100%<\/span>/);
  assert.match(html, /<h2>Waiting for you<\/h2>[\s\S]*class="has-work"><b>2<\/b>Approvals to give/);
  assert.ok(html.includes('id="dash-shortcuts"') && html.includes('id="pending-bell"') && html.includes('id="favourite-toggle"') && html.includes('id="print-page"'));
});

test('a register of one entry type shows quantity and amount with a total', async () => {
  const { registerPage } = await import('./entry-page.mjs');
  const rows = [{ ...row('E2', '2026-11-20', 'Posted', { litres: 20000, value: 1800000 }), maker: 'a' }, { ...row('E2', '2026-11-21', 'Posted', { litres: 5000, value: 450000 }), maker: 'a' },
    { ...row('E2', '2026-11-22', 'Returned', { litres: 999, value: 999 }), maker: 'a' }];
  const html = registerPage(actor, rows, 'E2');
  assert.match(html, /<th class="number">Quantity \(L\)<\/th><th class="number">Amount \(₹\)<\/th>/);
  assert.match(html, /<tfoot><tr><th scope="row" colspan="3">Total · 3 records .*<td class="number">25,000<\/td><td class="number">22,50,000<\/td>/);
  assert.ok(!registerPage(actor, rows, null).includes('<tfoot>'), 'the mixed entry register keeps its columns');
});

test('a long register opens with 100 records, totals all of them, and every page carries help', async () => {
  const { registerPage } = await import('./entry-page.mjs');
  const many = Array.from({ length: 130 }, (_, index) => ({ ...row('E2', '2026-11-20', 'Posted', { litres: 100, value: 1000 }), id: 'po-' + index, maker: 'a' }));
  const html = registerPage(actor, many, 'E2', { status: 'Posted' });
  assert.equal(html.match(/class="record-link"/g).length, 100);
  assert.match(html, /Showing 100 of 130 records · <a href="\/entries\/type\/E2\?status=Posted&amp;rows=200">Show 100 more<\/a> · <a href="\/entries\/type\/E2\?status=Posted&amp;rows=all">Show all<\/a>/);
  assert.match(html, /Total · 130 records .*<td class="number">13,000<\/td><td class="number">1,30,000<\/td>/);
  assert.equal(registerPage(actor, many, 'E2', { rows: 'all' }).match(/class="record-link"/g).length, 130);
  assert.ok(!registerPage(actor, many.slice(0, 5), 'E2').includes('register-more'));
  for (const part of ['id="help-open"', '<dialog id="page-help"', 'Purchase order — made by the Procurement Executive.', 'Ctrl + K searches every page', '/entries/assets/field-hints.js'])
    assert.ok(html.includes(part), part);
  assert.match(dashboardPage(actor, [], {}, { sites: [], site: 'all', stock: [], today: '2026-11-27' }), /Click any card to open the records behind it\./);
});

test('Master Data shows every master as a card with its count, source and missing-field warning', async () => {
  const { masterCards, overview } = await import('../master-insights/insights-page.mjs');
  const data = { masterDataPath: '/master-data', pulse: [{ slug: 'site', name: 'Location Master', count: 3 }],
    masters: [{ slug: 'account-master', name: 'Account Master', count: 1650, incomplete: 165 }, { slug: 'diesel-rate-master', name: 'Diesel Rate Master', count: 1 }] };
  const html = masterCards(data);
  assert.match(html, /3 masters · reference data used across the Diesel Workspace/);
  assert.match(html, /<a class="master-card" href="\/master-data\?master=account-master" data-fields="[^"]*Parent Group[^"]*">[\s\S]*?<b>Account Master<\/b><small>1,650 records<\/small>\s*<em class="record-incomplete">165 missing required fields<\/em>/);
  assert.match(html, /href="\/pulse-masters\?master=site"[^>]*>[\s\S]*?<b>Location Master<\/b><small>3 records <i class="from-pulse">Pulse<\/i><\/small>/);
  assert.match(html, /<b>Diesel Rate Master<\/b><small>1 record<\/small>/);
  assert.ok(html.indexOf('Account Master') < html.indexOf('Diesel Rate Master') && html.indexOf('Diesel Rate Master') < html.indexOf('Location Master'), 'cards are in name order');
  // The Pulse table lives under Data review, not on the cards page.
  const page = overview(data);
  assert.ok(html.includes('id="master-card-filter"') && !html.includes('<h2>From Pulse</h2>'));
  assert.ok(page.includes('<h2>From Pulse</h2>') && page.includes('Pulse data has not been fetched yet.') && !page.includes('master-card'));
});
