import { themeHead, themeToggle } from '../theme/theme-toggle.mjs';
import { byId } from './catalog.mjs';
import { entryRole, roles, roleKey, sites } from './review-masters.mjs';
import { indentSiteForm } from './indent-fields.mjs';
import { entrySiteDirectory } from './entry-sites.mjs';
import { icons, menuEntries, workspaceFor } from './workspace-map.mjs';
import { masters } from '../masters/catalog.mjs';

export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]);
export const option = (value, label, selected) =>
  `<option value="${esc(value)}"${selected ? ' selected' : ''}>${esc(label)}</option>`;
const groups = ['Buy', 'Receive', 'Store and issue', 'Money', 'Control'];
const sections = { workspace: 'Workspace', dashboard: 'Dashboard' };

// Everything the search box can open: pages, the entries on this person's menu, and the masters.
function searchItems(actor, active) {
  const pages = [['Dashboard', '/entries/dashboard', 'Home'], ['Workspace', '/entries/workspace', 'Home'], ['All entries', '/entries', 'Entry'],
    ['My work', '/entries/home', 'Entry'], ['My approvals', '/entries/approvals', 'Entry'], ['My alerts', '/entries/alerts', 'Entry']]
    // The indent screen keeps approvals off the page, as its menu does.
    .filter(([name]) => active !== 'E1' || name !== 'My approvals');
  const modules = workspaceFor(actor).flatMap(category => category.modules.map(module => [module.name, '/entries/type/' + module.id, 'Workspace · ' + category.name]));
  const masterData = actor.canOpenMasters === false ? [] : [['Master Data', '/master-data', 'Home'],
    ...masters.filter(({ slug }) => slug !== 'location-master').map(({ name, slug }) => [name, '/master-data?master=' + slug, 'Master Data'])];
  return [...pages, ...modules, ...masterData];
}
const searchDialog = (actor, active) => `<dialog id="global-search" aria-label="Search modules"><form method="dialog"><label class="search-box">${icons.search}<input type="search" id="global-search-input" placeholder="Search modules, masters and pages" autocomplete="off" aria-controls="global-search-results"></label></form>
    <ul id="global-search-results">${searchItems(actor, active).map(([name, href, where]) => `<li><a href="${esc(href)}"><b>${esc(name)}</b><small>${esc(where)}</small></a></li>`).join('')}</ul>
    <p id="global-search-empty" hidden>Nothing matches that search.</p></dialog>`;

function navigation(active, actor) {
  const { canOpenMasters, siteEntryTypes:types, hosted } = actor;
  const visible = menuEntries(actor, active);
  // A person who works every entry (the shared workspace) gets the short menu: the entries themselves are the cards in
  // Diesel Workspace. A person with an assigned role or a site stock workspace keeps the full list of their own entries.
  const simple = !types && !actor.assignments, masters = canOpenMasters !== false;
  const shortMenu = `<a class="nav-main" href="/entries" ${active ? '' : 'aria-current="page"'}>${icons.module}All entries</a>
    ${masters ? `<a class="nav-main" href="/master-data">${icons.masters}Master Data</a>` : ''}
    ${masters && hosted ? `<a class="nav-main" href="/master-insights">${icons.control}Data overview</a>
    <p class="rail-label">Approvers</p><a class="nav-home" href="/indent-approvers">Indent approvers</a><a class="nav-home" href="/po-approvers">PO approvers</a>` : ''}`;
  const fullMenu = `${masters ? `<a class="nav-main" href="/master-data">${icons.masters}Master Data</a>` : ''}
    <p class="rail-label">Entry</p>
    <a class="nav-home" href="/entries" ${active ? '' : 'aria-current="page"'}><i class="grid-icon" aria-hidden="true"></i>All entries</a>
    <a class="nav-home" href="/entries/home" ${active === 'home' ? 'aria-current="page"' : ''}>My work</a>
    ${active==='E1'?'':`<a class="nav-home" href="/entries/approvals" ${active === 'approvals' ? 'aria-current="page"' : ''}>My approvals</a>`}
    <a class="nav-home" href="/entries/alerts" ${active === 'alerts' ? 'aria-current="page"' : ''}>My alerts</a>
    ${types || hosted ? `<a class="nav-home" href="/entries/opening-stock" ${active==='opening-stock'?'aria-current="page"':''}>Opening stock</a>` : ''}
    ${groups.filter(group => visible.some(entry => entry.group === group)).map(group => `<details ${(!active && group === 'Buy') || byId[active]?.group === group ? 'open' : ''}>
      <summary><span>${group}</span><small>${visible.filter(e => e.group === group).length}</small></summary>
      ${visible.filter(e => e.group === group).map(e => `<a href="/entries/type/${e.id}" ${active === e.id ? 'aria-current="page"' : ''}><small>${e.code}</small><span>${esc(e.name)}</span></a>`).join('')}
      </details>`).join('')}`;
  return `<aside class="rail"><div class="rail-title"><span>${simple ? 'Diesel' : 'Entry'}</span>
    <button type="button" id="rail-toggle" title="Hide the menu">☰ Hide menu</button>
    <button id="nav-toggle" aria-controls="entry-navigation" aria-expanded="${['dashboard','workspace'].includes(active)}" hidden>Browse entries</button></div>
    <nav id="entry-navigation" aria-label="Diesel entries">
    <button type="button" id="global-search-open" class="rail-search" hidden>${icons.search}<span>Search modules…</span><kbd>Ctrl K</kbd></button>
    <a class="nav-main" href="/entries/dashboard" ${active === 'dashboard' ? 'aria-current="page"' : ''}>${icons.dashboard}Dashboard</a>
    <a class="nav-main" href="/entries/workspace" ${active === 'workspace' ? 'aria-current="page"' : ''}>${icons.workspace}Workspace</a>
    ${simple ? shortMenu : fullMenu}
    ${canOpenMasters === false || simple ? '' : '<a class="masters-link" href="/">← Masters</a>'}</nav></aside>`;
}

// The search box, its menu button, the clock, the bell and Help, for pages outside the entry shell (the master pages)
// to add to themselves, so every Diesel page has the same top bar tools.
export const shellParts = actor => `<template id="shell-parts"><button type="button" id="global-search-open" class="rail-search">${icons.search}<span>Search modules…</span><kbd>Ctrl K</kbd></button>
  <span class="today-clock" id="today-clock">${icons.calendar}<time id="today-date"></time>${icons.clock}<time id="today-time"></time></span>
  <a class="pending-bell" id="pending-bell" href="/entries/approvals" title="Waiting for you" hidden>${icons.bell}<b id="pending-count"></b><span class="sr-only">items waiting for you</span></a>
  <button type="button" id="help-open" class="page-tool" title="How to use this page">? Help</button>${searchDialog(actor, '')}${helpDialog('masters')}</template>`;

// "How to use this page": what the page is for and the steps on it, plus the shortcuts that work everywhere.
const pageHelp = {
  dashboard: ['Figures and charts for the period and site you choose, worked out from saved entries.',
    ['Pick a period (Today, 7 Days … or your own From and To dates) and a site, then press Show.', 'Use the tabs to look at Buy, Receive, Stock Storage, Vehicle Fuel or Accounts & Billing.',
      'Click any card to open the records behind it.', '“Waiting for you” shows approvals to give and entries returned to you.']],
  workspace: ['Every entry as a card, grouped the way the department works.', ['Click a card to open that entry’s register.', 'Press + New on a card to start an entry your role makes.', 'Use the filter box to find an entry by name.']],
  approvals: ['Entries waiting for your approval in the role you are signed in as.', ['Open an entry to read it in full.', 'Approve it, or return it to its maker with a reason.']],
  alerts: ['Things at your site that need attention, such as late approvals or low stock.', ['Open the entry named in the alert and act on it.']],
  masters: ['Reference data used by every entry: suppliers, rates, items, storage and the rest.',
    ['On Master Data, click a master’s card to open its records; the filter box also finds a master by a field name.', 'Press + Add new on a master to enter a record, or Import to bring in an Excel or CSV file.',
      'Masters marked Pulse come from Pulse and are kept up to date from there.', 'Data overview lists records that need correcting, with a link to each one.']],
  home: ['The entries your role makes, and what is waiting for you today.', ['Pick an entry to start it.', 'Open My approvals or My alerts to clear what is waiting.']],
};
const everywhere = ['Ctrl + K searches every page, master and saved entry.', 'Enter moves to the next field; a new entry keeps what you type until you save it.',
  'A saved record has a Print button that prints it without the menus.'];
function helpDialog(active) {
  const entry = byId[active];
  const [about, steps] = entry ? [entry.name + (entry.maker ? ' — made by the ' + entry.maker + '.' : '.'),
    ['The register lists every saved ' + entry.name.toLowerCase() + ' of this site; use Search, Status and the dates to narrow it.', 'Press New entry, fill the fields marked * and save. A red “Not saved” message tells you what to correct.',
      'Tick records to export only those, and use Columns to hide what you do not need.', 'Open a saved record to read, print or download it.']]
    : pageHelp[active] ?? ['The register of every entry saved at this site.', ['Use Search, Status and the dates to find an entry.', 'Click an entry to open it.', 'Use the menu on the left or Ctrl + K to go anywhere else.']];
  return `<dialog id="page-help" aria-label="How to use this page"><form method="dialog"><h2>How to use this page</h2><p>${esc(about)}</p>
    <ol>${steps.map(step => `<li>${esc(step)}</li>`).join('')}</ol><h3>Works on every page</h3><ul>${everywhere.map(tip => `<li>${esc(tip)}</li>`).join('')}</ul>
    <button class="primary">Close</button></form></dialog>`;
}

function switcher(actor, back) {
  const role = actor.profile === 'entry-deputy' ? 'Deputy Site In-charge' : entryRole(actor);
  const context = `<i class="location-mark" aria-hidden="true"></i>${esc(actor.site)}<span class="role-name">${esc(role)}</span>`;
  if (actor.assignments?.length === 1) return `<div class="assigned-context">${context}</div>`;
  if (actor.assignments) return `<details class="context"><summary>${context}</summary>
    <form class="switch" method="post" action="/workspace/role"><input type="hidden" name="returnTo" value="${esc(back)}">
    <label>Assigned site and role<select name="assignment">${actor.assignments.map(grant =>
    option(grant.key, grant.site + ' · ' + grant.role, grant.site === actor.site && grant.profile === actor.profile)).join('')}</select></label>
    <button class="primary">Switch</button></form></details>`;
  return `<details class="context"><summary><i class="location-mark" aria-hidden="true"></i>${esc(actor.site)}<span class="role-name">${esc(role)}</span></summary>
    <form class="switch" method="post" action="/workspace/role"><input type="hidden" name="returnTo" value="${esc(back)}">
    <label>Site<select name="site">${(actor.entrySites ? entrySiteDirectory(actor).map(row => [row.site, row.name]) : sites.map(s => [s, s])).map(([s, name]) => option(s, name, s === actor.site)).join('')}</select></label>
    <label>Review role<select name="role">${roles.map(r => option(roleKey(r), r, r === role)).join('')}${option('entry-deputy', 'Deputy Site In-charge', actor.profile === 'entry-deputy')}</select></label>
    <button class="primary">Switch</button></form></details>`;
}

export function page(title, actor, active, back, body, heading, remoteApproval = false,indentSiteInForm=false) {
  // Print is offered on a saved record, the one page people print.
  const printable = String(back).startsWith('/entries/record/');
  const menuDefault=['dashboard','workspace'].includes(active)?'shown':'hidden';
  return `<!doctype html><html lang="en" data-menu-default="${menuDefault}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · Diesel entries</title>${themeHead}
    <link rel="stylesheet" href="/entries/assets/entries.css"><link rel="stylesheet" href="/entries/assets/workspace.css"><script defer src="/entries/assets/workspace-shell.js"></script>${active==='E1'?'<link rel="stylesheet" href="/entries/assets/indent.css">':''}${active==='E2'?'<link rel="stylesheet" href="/entries/assets/purchase-order.css"><script type="module" src="/entries/assets/purchase-order-form.js"></script>':''}${active==='E4'?'<link rel="stylesheet" href="/entries/assets/purchase-order.css">':''}${active==='E7'?'<link rel="stylesheet" href="/entries/assets/purchase-order.css"><script type="module" src="/entries/assets/grn-form.js"></script>':''}<script defer src="/entries/assets/entry-form.js"></script>
    ${remoteApproval ? '<script defer src="/entries/assets/remote-approval.js"></script>' : ''}
    ${active==='approvals' ? '<script defer src="/entries/assets/approval-inbox.js"></script>' : ''}<script defer src="/entries/assets/field-states.js"></script>
    ${active==='E11' && actor.siteEntryTypes ? '<script type="module" src="/entries/assets/fuel-issue-form.js"></script>' : ''}
    ${active==='E10A' && actor.siteEntryTypes ? '<script type="module" src="/entries/assets/home-tank.js"></script>' : ''}
    ${['E5','E6','E10A','E10B','E11','E12','E14'].includes(active) ? '<script defer src="/entries/assets/qr-decoder.js"></script><script defer src="/entries/assets/phone-capture.js"></script>' : ''}
    </head><body class="${active==='E1'?'indent-workspace':['E2','E4','E7'].includes(active)?'order-workspace':''}" data-actor="${esc(actor.actionContext ?? actor.id)}" data-hosted="${Boolean(actor.hosted)}" data-offline-scope="${esc(actor.offlineScope)}">
    <a href="#workspace" class="skip-link">Skip to workspace</a>
    <header class="masthead"><a class="brand" href="/"><img src="/masters/assets/pulse.png" alt="" width="34" height="34"><span>Caliber <b>Pulse</b></span><em>Diesel</em></a>
    <div class="tools"><a class="pending-bell" id="pending-bell" href="/entries/approvals" title="Waiting for you" hidden>${icons.bell}<b id="pending-count"></b><span class="sr-only">items waiting for you</span></a><span class="today-clock" id="today-clock" hidden>${icons.calendar}<time id="today-date"></time>${icons.clock}<time id="today-time"></time></span><span class="environment">${actor.siteEntryTypes ? (actor.hosted?'Site stock workspace':'Local site stock workspace') : actor.assignments ? 'Role-based pilot · sample data' : actor.trial ? 'Trial workspace · sample data · not live records' : actor.hosted?'Personal review · sample data':'Local review · sample data'}</span>${themeToggle}${actor.assignments ? '<form method="post" action="/api/sign-out"><button>Sign out</button></form>' : ''}</div></header>
    <div class="shell">${navigation(active,actor)}<main id="workspace" tabindex="-1">
    <div class="context-bar"><div class="crumb"><button type="button" id="rail-show" title="Show the menu" hidden>☰ Show menu</button><a href="/">Diesel</a><i aria-hidden="true">/</i><a href="/entries">Entry</a>${active ? `<i aria-hidden="true">/</i><span>${esc(byId[active]?.name ?? sections[active] ?? active)}</span>` : ''}</div><div class="page-tools">${printable ? '<button type="button" id="print-page" class="page-tool" title="Print this record" hidden>Print</button>' : ''}<button type="button" id="help-open" class="page-tool" title="How to use this page" hidden>? Help</button></div>${active==='E1'?indentSiteForm(actor,indentSiteInForm):switcher(actor,back)}</div>
    ${heading ?? `<h1>${esc(title)}</h1>`}${body}<output id="sync-status" aria-live="polite"></output>
    <section id="offline-entries" hidden><h2>Entries waiting to sync</h2><ul></ul></section></main></div>${searchDialog(actor, active)}${helpDialog(active)}</body></html>`;
}
