import assert from 'node:assert/strict';
import test from 'node:test';
import { dashboardFigures, period, presets } from './dashboard-figures.mjs';
import { dashboardPage } from './dashboard-page.mjs';
import { workspaceFor } from './workspace-map.mjs';
import { workspacePage } from './workspace-page.mjs';
import { roleKey } from './review-masters.mjs';
import { masterSidebar } from '../masters/master-sidebar.mjs';

const actor = { id: 'Jayant-buyer', site: 'Jayant', profile: 'procurement-executive' };
const row = (type, day, status, result = {}, data = {}) => ({ id: type + day + status, type, day, status, rev: 1, site: 'Jayant', number: type + '-1', result, data });

test('the workspace groups every menu entry under the department headings and keeps gate entry off it', () => {
  const list = workspaceFor(actor);
  assert.deepEqual(list.map(category => category.name), ['BUY', 'RECEIVE', 'STOCK STORAGE MANAGEMENT', 'VEHICLE FUEL ENTRY', 'ACCOUNTS & BILLING', 'CONTROL']);
  assert.deepEqual(list[0].modules.map(module => module.id), ['E1', 'E2', 'E3', 'E4']);
  assert.deepEqual(list[1].modules.map(module => module.id), ['E7']);
  const placed = list.flatMap(category => category.modules.map(module => module.id));
  assert.equal(new Set(placed).size, placed.length);
  assert.ok(!placed.includes('E5') && !placed.includes('E6') && placed.length === 17, 'every entry except the gate entry and the separate inspection has one place');
  // One page of cards under category headings: the count, anything waiting, the register, and a new entry for the maker.
  const buyer = { ...actor, profile: roleKey('Procurement Executive') };
  const html = workspacePage(buyer, [row('E2', '2026-11-27', 'Posted'), { ...row('E2', '2026-11-26', 'Awaiting approval'), id: 'w' }, { ...row('E2', '2026-11-25', 'Returned'), id: 'r' }, { ...row('E2', '2026-11-24', 'Draft'), id: 'd', rev: 0 }]);
  assert.match(html, /<h1>Workspace<\/h1>/);
  assert.match(html, /17 entries · everything the department records/);
  assert.match(html, /<section class="ws-group cat-buy"><h2><span class="ws-icon small">.*?<\/span>BUY<small>Requirement, ordering, payment and tanker allocation<\/small><\/h2>/s);
  assert.match(html, /<a class="ws-card-open" href="\/entries\/type\/E2">[\s\S]*?<b>Purchase order<\/b><small>3 records<\/small>\s*<em class="ws-badge">1 awaiting approval<\/em><em class="ws-badge returned">1 returned<\/em>/);
  assert.match(html, /<a class="ws-new" href="\/entries\/new\/E2" title="Start a new Purchase order">\+ New<\/a>/);
  assert.ok(!html.includes('href="/entries/new/E7"'), 'only the maker role gets + New');
  assert.ok(html.includes('id="workspace-filter"') && html.indexOf('>BUY<') < html.indexOf('>RECEIVE<') && html.indexOf('>RECEIVE<') < html.indexOf('>CONTROL<'), 'categories stay in work order');
  // The menu and the search box reach the new pages from any entry page.
  for (const part of ['href="/entries/dashboard"', 'href="/entries/workspace" aria-current="page"', 'href="/master-data"', 'id="global-search"', 'All entries'])
    assert.ok(html.includes(part), part);
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
  assert.match(html, /<div class="main-links"><a href="\/entries\/dashboard">.*Dashboard<\/a>\s*<a href="\/entries\/workspace">.*Workspace<\/a>\s*<a href="\/entries">.*All entries<\/a>\s*<a href="\/master-data" aria-current="page">.*Master Data<\/a>\s*<a href="\/master-insights\?view=checks">.*Data overview<\/a><\/div>/s);
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
  assert.match(html, /<a class="kpi" href="\/entries\/type\/E2\?from=2026-11-18&amp;to=2026-11-27&amp;sites=all" title="Open these records"><span class="kpi-label">Purchase Value<\/span>/);
  assert.match(html, /class="kpi-change up" title="Against the period just before">▲ 100%<\/span>/);
  assert.match(html, /<h2>Waiting for you<\/h2>[\s\S]*class="has-work"><b>2<\/b>Approvals to give/);
  assert.ok(html.includes('id="dash-shortcuts"') && html.includes('id="pending-bell"') && !html.includes('favourite') && !html.includes('id="print-page"'), 'no favourites, and Print only on a saved record');
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
  for (const part of ['id="help-open"', '<dialog id="page-help"', 'Purchase order — made by the Procurement Executive.', 'Ctrl + K searches every page'])
    assert.ok(html.includes(part), part);
  assert.match(dashboardPage(actor, [], {}, { sites: [], site: 'all', stock: [], today: '2026-11-27' }), /Click any card to open the records behind it\./);
});

test('Master Data shows every master as a card with its count, source and missing-field warning', async () => {
  const { masterCards, overview } = await import('../master-insights/insights-page.mjs');
  const data = { masterDataPath: '/master-data', pulse: [{ slug: 'site', name: 'Location Master', count: 3 }],
    masters: [{ slug: 'account-master', name: 'Account Master', count: 1650, incomplete: 165 }, { slug: 'diesel-rate-master', name: 'Diesel Rate Master', count: 1 }] };
  const html = masterCards(data);
  assert.match(html, /3 masters · reference data used across the Workspace/);
  assert.match(html, /<a class="master-card" href="\/master-data\?master=account-master" data-fields="[^"]*Parent Group[^"]*">[\s\S]*?<b>Account Master<\/b><small>1,650 records<\/small>\s*<em class="record-incomplete">165 missing required fields<\/em>/);
  assert.match(html, /href="\/pulse-masters\?master=site"[^>]*>[\s\S]*?<b>Location Master<\/b><small>3 records <i class="from-pulse">Pulse<\/i><\/small>/);
  assert.match(html, /<b>Diesel Rate Master<\/b><small>1 record<\/small>/);
  assert.ok(html.indexOf('Account Master') < html.indexOf('Diesel Rate Master') && html.indexOf('Diesel Rate Master') < html.indexOf('Location Master'), 'cards are in name order');
  // The Pulse table lives under Data review, not on the cards page.
  const page = overview(data);
  assert.ok(html.includes('id="master-card-filter"') && !html.includes('<h2>From Pulse</h2>'));
  assert.ok(page.includes('<h2>From Pulse</h2>') && page.includes('Pulse data has not been fetched yet.') && !page.includes('master-card'));
});

test('the shared workspace gets the short menu; an assigned role keeps its own list of entries', async () => {
  const { page } = await import('./entry-shell.mjs');
  const short = page('Any', { ...actor, hosted: true, trial: true }, 'E2', '/entries/type/E2', '');
  for (const part of ['href="/entries/dashboard"', 'href="/entries/workspace"', 'All entries</a>', 'href="/master-data"', 'href="/master-insights"', 'Data overview</a>',
    'href="/indent-approvers">Indent approvers</a>', 'href="/po-approvers">PO approvers</a>', 'Trial workspace · sample data · not live records']) assert.ok(short.includes(part), part);
  // My work, My approvals and My alerts stay reachable from the search box and the bell, but are off the menu.
  assert.doesNotMatch(short, /class="nav-home" href="\/entries\/(home|approvals|alerts)"|<summary><span>Buy<\/span>|<small>E2<\/small>|← Masters|id="entry-language"|field-hints|entry-language\.js/);
  assert.ok(!short.includes('id="print-page"') && page('Record', actor, 'E2', '/entries/record/abc', '').includes('id="print-page"'), 'Print is on a saved record only');
  const assigned = page('Any', { ...actor, assignments: [{ key: 'k', site: 'Jayant', role: 'Site Store', profile: 'site-store' }] }, 'E7', '/entries/type/E7', '');
  assert.match(assigned, /My work<\/a>[\s\S]*<summary><span>/);
});

test('a register opened across sites shows the site of each record and carries the choice on its links', async () => {
  const { registerPage } = await import('./entry-page.mjs');
  const { shellParts } = await import('./entry-shell.mjs');
  const rows = [{ ...row('E2', '2026-11-20', 'Posted', { litres: 100, value: 1000 }), maker: 'a' }, { ...row('E2', '2026-11-21', 'Posted', { litres: 200, value: 2000 }), id: 'other', site: 'Sasti', maker: 'a' }];
  const wide = registerPage(actor, rows, 'E2', { sites: 'all', from: '2026-11-18' });
  assert.match(wide, /<th>Document<\/th><th>Site<\/th>/);
  assert.match(wide, /<td>Sasti<\/td>/);
  assert.match(wide, /<input type="hidden" name="sites" value="all"><\/form><p class="register-wide">Showing every site you can open · <a href="\/entries\/type\/E2">Show only Jayant<\/a><\/p>/);
  assert.match(wide, /href="\/entries\/export\.xlsx\?type=E2&amp;[^"]*sites=all"/);
  assert.match(wide, /<th scope="row" colspan="4">Total · 2 records/);
  const own = registerPage(actor, rows.slice(0, 1), 'E2', { sites: 'Jayant' });
  assert.ok(!own.includes('<th>Site</th>') && !own.includes('register-wide'), 'the signed-in site alone is the ordinary register');
  // Master pages borrow the same top bar tools.
  const parts = shellParts(actor);
  for (const id of ['global-search-open', 'today-clock', 'pending-bell', 'help-open', 'global-search', 'page-help']) assert.ok(parts.includes('id="' + id + '"'), id);
  assert.match(parts, /Press \+ Add new on a master to enter a record/);
});

test('All entries has a tab for each kind of entry with records, and the menu carries its own Hide button', async () => {
  const { registerPage } = await import('./entry-page.mjs');
  const rows = [{ ...row('E2', '2026-11-20', 'Posted', { litres: 100, value: 1000 }), maker: 'a' }, { ...row('E2', '2026-11-21', 'Draft'), id: 'd', maker: 'a' }, { ...row('E1', '2026-11-22', 'Posted', { litres: 50 }), maker: 'a' }];
  const all = registerPage(actor, rows, null, { status: 'Posted' });
  assert.match(all, /<h1>All entries<\/h1>/);
  assert.match(all, /<nav class="entry-tabs" aria-label="Kinds of entry"><a href="\/entries\?status=Posted" aria-current="page">All<small>2<\/small><\/a><a href="\/entries\?status=Posted&amp;kind=E1">Diesel indent<small>1<\/small><\/a><a href="\/entries\?status=Posted&amp;kind=E2">Purchase order<small>1<\/small><\/a><\/nav>/);
  const orders = registerPage(actor, rows, null, { kind: 'E2' });
  assert.equal(orders.match(/class="record-link"/g).length, 2);
  assert.match(orders, /kind=E2" aria-current="page">Purchase order<small>2<\/small>/);
  assert.match(orders, /<input type="hidden" name="kind" value="E2"><\/form>/);
  assert.match(orders, /href="\/entries\/export\.xlsx\?type=E2/);
  assert.match(orders, /<th class="number">Quantity \(L\)<\/th>/, 'a tab shows that entry’s quantity and amount');
  assert.ok(!registerPage(actor, rows, 'E2').includes('entry-tabs') && !registerPage(actor, rows.slice(0, 2), null).includes('entry-tabs'), 'no tabs on one entry’s own register, or when there is only one kind');
  // Hide menu sits at the top of the menu; Show menu is on the page for when it is hidden.
  assert.match(all, /<div class="rail-title"><span>Diesel<\/span>\s*<button type="button" id="rail-toggle" title="Hide the menu">☰ Hide menu<\/button>/);
  assert.match(all, /<div class="crumb"><button type="button" id="rail-show" title="Show the menu" hidden>☰ Show menu<\/button>/);
  assert.match(masterSidebar({ masterData: true, pulseMasters: true }), /<button type="button" class="sidebar-hide" data-sidebar-hide hidden>☰ Hide menu<\/button>/);
});

test('the count cards follow the tab and say which kinds of entry the records are', async () => {
  const { registerPage } = await import('./entry-page.mjs');
  const rows = [{ ...row('E2', '2026-11-20', 'Draft'), id: 'a', maker: 'a' }, { ...row('E2', '2026-11-21', 'Awaiting approval'), id: 'b', maker: 'a' }, { ...row('E2', '2026-11-22', 'Posted'), id: 'c', maker: 'a' },
    { ...row('E1', '2026-11-22', 'Saved', { litres: 50 }), id: 'd', maker: 'a' }, { ...row('E1', '2026-11-23', 'Posted', { litres: 50 }), id: 'e', maker: 'a' }];
  const all = registerPage(actor, rows, null, {});
  assert.match(all, /<a class="waiting" href="\/entries\?status=Waiting" ><span class="count-label">Awaiting approval<\/span><strong>2<\/strong>/, 'a saved indent counts as waiting');
  assert.match(all, /<p aria-label="Drafts by entry"><a href="\/entries\?status=Draft&amp;kind=E2">Purchase order <b>1<\/b><\/a><\/p>/);
  assert.match(all, /<p aria-label="Awaiting approval by entry"><a href="\/entries\?status=Waiting&amp;kind=E1">Diesel indent <b>1<\/b><\/a><a href="\/entries\?status=Waiting&amp;kind=E2">Purchase order <b>1<\/b><\/a><\/p>/);
  const orders = registerPage(actor, rows, null, { kind: 'E2' });
  assert.match(orders, /<a class="posted" href="\/entries\?status=Posted&amp;kind=E2" ><span class="count-label">Posted · Purchase order<\/span><strong>1<\/strong>/);
  assert.ok(!orders.includes('count-where'), 'a single tab needs no breakdown');
  const waitingList = registerPage(actor, rows, null, { status: 'Waiting' });
  assert.equal(waitingList.match(/class="record-link"/g).length, 2, 'the Waiting filter lists every kind of waiting');
});

test('an entry is dated within the last three days, and a quantity is more than zero', async () => {
  const { earliestEntryDay, entryDayMin, entryDateWindow, validateFields } = await import('./entry-rules.mjs');
  assert.equal(earliestEntryDay('2026-11-27'), '2026-11-24');
  assert.equal(earliestEntryDay('2026-03-02'), '2026-02-27');
  assert.equal(entryDayMin('2026-11-27', { rev: 0, day: '2026-11-27' }), '2026-11-24');
  assert.equal(entryDayMin('2026-11-27', { rev: 2, day: '2026-11-10' }), '2026-11-10', 'a saved entry keeps its older date');
  assert.deepEqual([entryDateWindow({}), entryDateWindow({ DIESEL_ENTRY_DATE_WINDOW_DAYS: '7' }), entryDateWindow({ DIESEL_ENTRY_DATE_WINDOW_DAYS: 'off' })], [3, 7, null]);
  assert.equal(earliestEntryDay('2026-11-27', null), '');
  const type = { fields: [{ key: 'litres', label: 'Quantity', type: 'number' }, { key: 'tolerance', label: 'Tolerance', type: 'number', optional: true }] };
  assert.throws(() => validateFields(type, { litres: 0 }), /Quantity must be more than zero\./);
  assert.throws(() => validateFields(type, { litres: -5 }), /Quantity cannot be negative\./);
  assert.deepEqual(validateFields(type, { litres: 10, tolerance: 0 }), { litres: 10, tolerance: 0 });

  const { openDieselDatabase } = await import('../../data/database.mjs');
  const { createEntryStore } = await import('./entry-store.mjs'), { randomUUID } = await import('node:crypto'), { businessDay } = await import('./entry-rules.mjs');
  const db = openDieselDatabase(':memory:'), store = createEntryStore(db), maker = { id: 'Jayant-site', site: 'Jayant', profile: 'entry-0', name: 'Site' };
  const today = businessDay(), back = days => new Date(Date.parse(today) - days * 864e5).toISOString().slice(0, 10);
  const indent = day => store.write(randomUUID(), maker, { type: 'E1', rev: 0, day, action: 'Save draft', data: { litres: 100, requiredBy: 2 } });
  assert.equal(indent(back(3)).day, back(3), 'three days back is allowed');
  assert.throws(() => indent(back(4)), /Choose a date within the last 3 days\. Older dates are not allowed\./);
  assert.throws(() => indent(back(-1)), /today’s business date or an earlier date/);
  db.close();
});

test('downloads carry the form fields and the creation time, and a printed record carries only its details', async () => {
  const { entryExportRows, entryCsvRows } = await import('./entry-register.mjs');
  const { detailPage } = await import('./entry-page.mjs');
  const order = { ...row('E2', '2026-11-20', 'Posted', { litres: 500, value: 57622, supplier: 'S' }), id: 'po', number: 'CMLL/CMP/PO/26-27/001' };
  const schedule = { ...row('E4', '2026-11-27', 'Posted', { supplier: 'SANDEEP GASOLENES', balance: 200, order: 'x' },
    { po: 'po', deliveryDate: '2026-11-28', deliveryLocation: 'CMPL Chandrapur', deliveryAddress: 'Chandrapur', item: 'Diesel', litres: 300, vehicleNo: 'MH34BZ4330', transporter: 'ASHOK ROADWAYS' }),
    number: 'E4-JAY-2026-0001', created: '2026-11-27T11:10:00.000Z', createdBy: 'SIDDHARTH HOONKA' };
  const indent = { ...row('E1', '2026-11-27', 'Posted', { sanctioned: 5555, stock: { 'Tank and bowser stock (L)': 9 } }, { litres: 5000, unit: 'Litre', priority: 'Normal', requiredBy: 2 }), id: 'in', number: 'CMLL/JOC/IND/26-27/001', created: '2026-11-27T11:10:00.000Z' };
  const one = entryExportRows([schedule], [schedule, order]);
  assert.deepEqual(one[0], ['Document', 'Date', 'Status', 'Site', 'Purchase order', 'Delivery date', 'Delivery location', 'Delivery address', 'Item name', 'DSL Qty (L)', 'Vehicle No.', 'Transporter', 'Creation Date', 'Creation Time', 'Created By']);
  assert.deepEqual(one[1], ['E4-JAY-2026-0001', '2026-11-27', 'Posted', 'Jayant', 'CMLL/CMP/PO/26-27/001', '2026-11-28', 'CMPL Chandrapur', 'Chandrapur', 'Diesel', 300, 'MH34BZ4330', 'ASHOK ROADWAYS', '27-Nov-2026', '04:40 PM', 'SIDDHARTH HOONKA']);
  const indents = entryExportRows([indent]);
  assert.ok(indents[0].includes('Sanction quantity') && indents[1].includes(5555) && indents[0].includes('Status'));
  assert.ok(!JSON.stringify(indents).includes('Tank and bowser stock'), 'no site stock in a download');
  const mixed = entryCsvRows([schedule, indent], [schedule, indent, order]);
  assert.deepEqual(mixed[0], ['Document', 'Entry', 'Site', 'Date', 'Status', 'Details', 'Creation Date', 'Creation Time', 'Created By']);
  assert.match(mixed[1][5], /^Purchase order: CMLL\/CMP\/PO\/26-27\/001; Delivery date: 2026-11-28; .*Transporter: ASHOK ROADWAYS$/);
  assert.ok(!JSON.stringify(mixed).includes('balance') && !JSON.stringify(mixed).includes('{'), 'no worked-out results and no raw data');

  const page = detailPage({ ...actor, profile: roleKey('Procurement Executive') }, schedule, [schedule, order], [{ action: 'Approve', actor: 'Asha', stamp: '2026-11-27T11:12:00.000Z' }], null);
  assert.match(page, /<div class="print-only print-head"><h1>Delivery Schedule · E4-JAY-2026-0001<\/h1>\s*<p>Created on 27 Nov 2026, 04:40 pm IST by SIDDHARTH HOONKA<\/p>\s*<p class="print-approval">/);
  // The approval prints in the head, so it is on the first page however long the form is.
  assert.match(page, /<p class="print-approval">Approved by Asha · 27 Nov 2026, 04:42 pm IST<\/p><\/div>/);
  assert.ok(!page.includes('print-foot'));
  assert.match(page, /<p class="record-back">/);
});
