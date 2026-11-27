import { mastersMenuLink } from '../masters/master-navigation.mjs';
import { themeHead, themeToggle } from '../theme/theme-toggle.mjs';
import { masters as catalog } from '../masters/catalog.mjs';
import { pulseMasters as pulseCatalog } from '../pulse-masters/pulse-master-catalog.mjs';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
export const insightsPath = '/master-insights';
// Data review: what needs correcting, which sites are ready, and what Diesel holds from Pulse.
const views = [['checks', 'Data checks'], ['sites', 'Site checklist'], ['overview', 'Pulse and equipment']];
const istTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
const table = (label, headings, rows) => `<div class="master-data-table insight-table" role="region" aria-label="${escape(label)}" tabindex="0"><table>
  <thead><tr>${headings.map(heading => `<th scope="col">${escape(heading)}</th>`).join('')}</tr></thead>
  <tbody>${rows.map(cells => `<tr>${cells.map((cell, index) => {
    const body = cell?.html ?? escape(cell);
    return index ? `<td data-label="${escape(headings[index])}">${body}</td>` : `<th scope="row">${body}</th>`;
  }).join('')}</tr>`).join('') || `<tr class="master-data-empty"><td colspan="${headings.length}">Nothing to show yet.</td></tr>`}</tbody></table></div>`;

// A simple picture for each master, chosen by what its name is about.
const glyph = paths => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const glyphs = [
  [/account/, '<path d="M4 5a2 2 0 0 1 2-2h5v16H6a2 2 0 0 0-2 2zM20 5a2 2 0 0 0-2-2h-5v16h5a2 2 0 0 1 2 2z"/>'],
  [/cost/, '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>'],
  [/rate|limit/, '<path d="M7 5h10M7 9h10M7 5c6 0 6 8 0 8l7 7"/>'],
  [/driver|employee|company/, '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 5.2a3.5 3.5 0 0 1 0 5.6M18.5 14.5c2 .8 3 2.6 3 5.5"/>'],
  [/equipment|instrument/, '<circle cx="7" cy="17" r="3"/><circle cx="18" cy="18" r="2"/><path d="M10 17h6M4 14V7h6l3 6h5v3M10 7v6"/>'],
  [/gst|tax/, '<path d="m5 19 14-14"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>'],
  [/item/, '<path d="M12 3 4 7v10l8 4 8-4V7z"/><path d="m4 7 8 4 8-4M12 11v10"/>'],
  [/storage|depot/, '<path d="M3 21V9l9-5 9 5v12"/><path d="M7 21v-8h10v8M7 17h10"/>'],
  [/location|site|region/, '<path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.800 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>'],
  [/reason|numbering/, '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.500" cy="8.500" r="1.500"/>'],
  [/route/, '<circle cx="6" cy="6" r="2.500"/><circle cx="18" cy="18" r="2.500"/><path d="M8.500 6H15a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h6.500"/>'],
  [/shift/, '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'],
  [/transport|freight/, '<path d="M2 6h11v10H2zM13 9h4l4 4v3h-8z"/><circle cx="6.500" cy="17.500" r="2"/><circle cx="17" cy="17.500" r="2"/>'],
];
const picture = name => glyph(glyphs.find(([about]) => about.test(name.toLowerCase()))?.[1] ?? '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>');
const arrow = glyph('<path d="M5 12h14m-6-6 6 6-6 6"/>');

// Every master as a card: its record count, whether Pulse owns it, and how many records still miss required fields.
export function masterCards({ pulse, masters, masterDataPath }) {
  // Each card also answers to its field names, so typing "PAN" in the filter finds the master that holds it.
  const fieldsOf = slug => (catalog.find(master => master.slug === slug)?.sections.flatMap(section => section.fields.map(field => field.label))
    ?? pulseCatalog.find(master => master.slug === slug)?.columns.map(([, label]) => label) ?? []).join(' ').replace(/[^\p{L}\p{N} ]/gu, ' ');
  const cards = [...masters.map(row => ({ ...row, fields: fieldsOf(row.slug), href: masterDataPath + '?master=' + row.slug })),
    ...pulse.map(row => ({ ...row, fields: fieldsOf(row.slug), fromPulse: true, href: '/pulse-masters?master=' + row.slug }))].toSorted((a, b) => a.name.localeCompare(b.name, 'en'));
  return `<div class="master-cards-head"><p class="record-meta">${cards.length} masters · reference data used across the Diesel Workspace</p>
    <label class="master-filter"><span class="sr-only">Filter masters</span><input type="search" id="master-card-filter" placeholder="Filter masters…" autocomplete="off" aria-controls="master-cards" hidden></label></div>
    <div class="master-cards" id="master-cards">${cards.map(card => `<a class="master-card" href="${escape(card.href)}" data-fields="${escape(card.fields ?? '')}"><span class="master-card-icon">${picture(card.name)}</span>
      <span class="master-card-text"><b>${escape(card.name)}</b><small>${Number(card.count).toLocaleString('en-IN')} record${card.count === 1 ? '' : 's'}${card.fromPulse ? ' <i class="from-pulse">Pulse</i>' : ''}</small>
      ${card.incomplete ? `<em class="record-incomplete">${card.incomplete} missing required fields</em>` : ''}</span><span class="master-card-arrow">${arrow}</span></a>`).join('')}</div>
    <p class="master-cards-none" id="master-cards-none" hidden>No master matches that filter.</p>`;
}

// "Pulse and equipment": how fresh the Pulse copy is, what it holds, and the equipment at each site.
export function overview({ pulse, summary }) {
  const fetched = pulse.map(row => row.syncedAt).filter(Boolean).toSorted().at(-1);
  return `<p class="record-meta pulse-fetched">${fetched ? 'Pulse data last fetched ' + istTime.format(new Date(fetched)) + ' IST.' : 'Pulse data has not been fetched yet.'}</p>
    <h2>From Pulse</h2>
    ${table('Pulse masters', ['Master', 'Records', 'Last fetched'], pulse.map(row => [
      { html: `<a href="/pulse-masters?master=${row.slug}">${escape(row.name)}</a>` }, row.count,
      row.syncedAt ? istTime.format(new Date(row.syncedAt)) + ' IST' : 'Not fetched yet']))}
    ${summary ? siteSummary(summary) : ''}`;
}

function sites({ checklist }) {
  const ready = checklist.filter(row => !row.missing.length).length;
  return `<p class="record-meta">${ready} of ${checklist.length} sites have equipment, drivers, shifts and storage locations.</p>
    ${table('Site checklist', ['Site', 'Region', 'Equipment', 'Drivers', 'Active shifts', 'Storage locations', 'Still missing'], checklist.map(row => [
      row.site, row.region, row.equipment, row.drivers, row.shifts, row.storage,
      row.missing.length ? { html: `<span class="record-incomplete">${escape(row.missing.join(', '))}</span>` } : 'Ready']))}`;
}

// Where each kind of finding is corrected, worked out from what the check is about.
const fixes = [[/^Storage/, 'Storage Location Master', '/master-data?master=storage-location-master'], [/^Equipment/, 'Equipment Master', '/pulse-masters?master=equipment'],
  [/^Drivers/, 'Driver Master', '/pulse-masters?master=driver'], [/^Shifts/, 'Shift Master', '/pulse-masters?master=shift'], [/^Accounts/, 'Account Master', '/master-data?master=account-master']];
// One finding as a row: the code or name it is about in bold, the detail beside it.
function finding(item) {
  const [, lead, mark, rest] = String(item).match(/^(.*?)( — |: | · )(.*)$/s) ?? [null, String(item), '', ''];
  return `<li><b>${escape(lead)}</b>${rest ? `<span>${escape(rest)}</span>` : ''}</li>`;
}

function checks({ findings }) {
  const open = findings.filter(check => check.count), clear = findings.filter(check => !check.count);
  const items = open.reduce((total, check) => total + check.count, 0);
  const tile = (value, label, tone) => `<div class="check-tile ${tone}"><strong>${value}</strong><span>${label}</span></div>`;
  return `<div class="check-summary">${tile(findings.length, 'Checks run', '')}${tile(open.length, open.length === 1 ? 'Check needs review' : 'Checks need review', open.length ? 'warn' : '')}
      ${tile(items.toLocaleString('en-IN'), items === 1 ? 'Record to correct' : 'Records to correct', items ? 'warn' : '')}${tile(clear.length, 'Clear', 'ok')}</div>
    <p class="record-meta">${open.length ? open.length + ' of ' + findings.length + ' checks found something to review.' : 'All ' + findings.length + ' checks are clear.'}</p>
    ${open.length ? '<label class="check-filter"><span class="sr-only">Find in the findings</span><input type="search" id="check-filter" placeholder="Find a code, name or site in the findings…" autocomplete="off" hidden></label>' : ''}
    <div class="check-list">${open.map(check => {
      const [, master, href] = fixes.find(([about]) => about.test(check.title)) ?? [];
      const shown = check.items.slice(0, 100);
      return `<section class="check-card"><header><span class="check-count" title="${check.count} to correct">${check.count}</span>
        <div><h2>${escape(check.title)}</h2><p>${escape(check.help)}</p></div>${href ? `<a class="check-fix" href="${href}">Open ${escape(master)} →</a>` : ''}</header>
        <ul class="check-items">${shown.slice(0, 12).map(finding).join('')}</ul>
        ${shown.length > 12 ? `<details class="check-more"><summary>Show all ${check.count > 100 ? '(first 100 of ' + check.count + ')' : check.count}</summary><ul class="check-items">${shown.slice(12).map(finding).join('')}</ul></details>` : ''}
        ${check.count > 100 ? `<p class="record-meta">Showing the first 100 of ${check.count}.</p>` : ''}</section>`;
    }).join('')}</div>
    <p class="check-none" id="check-none" hidden>Nothing in the findings matches that.</p>
    ${clear.length ? `<h2 class="check-clear-title">Clear</h2><ul class="check-clear">${clear.map(check => `<li><span aria-hidden="true">✓</span>${escape(check.title)}</li>`).join('')}</ul>` : ''}`;
}

// Site-wise equipment by category, then each site's drivers, shifts and storage locations.
export function siteSummary({ categories, rows, total, unplaced = 0 }) {
  const headings = ['Site', ...categories, 'Total equipment', 'Drivers', 'Active shifts', 'Storage locations'];
  const line = (name, row, link) => [link ? { html: `<a href="${escape('/pulse-masters?' + new URLSearchParams({ master: 'equipment', by: 'currentLocation', q: name }))}">${escape(name)}</a>${
    row.listed === false ? ' <small class="record-incomplete" title="Not in the Location Master">Not in Location Master</small>' : ''}` } : name,
    ...categories.map(category => row.counts[category] || ''), { html: `<strong>${row.total}</strong>` }, row.drivers || '', row.shifts || '', row.storage || ''];
  return `<h2>Equipment by site</h2>
    <p class="record-meta">Vehicles and equipment in the Pulse Equipment Master, counted by current location and equipment category.</p>
    ${table('Equipment by site', headings, [...rows.map(row => line(row.site, row, true)), ...(rows.length ? [line('All sites', total, false)] : [])])}
    ${unplaced ? `<p class="record-meta">${unplaced} equipment with no location in Pulse ${unplaced === 1 ? 'is' : 'are'} not counted here.</p>` : ''}`;
}

export function insightsPage({ actor, view, notice, masterDataPath, ...data }) {
  const title = views.find(([key]) => key === view)[1];
  return `<!doctype html>
<html lang="en"><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} · Master Data · Diesel</title><link rel="icon" href="/masters/assets/pulse.png">
  ${themeHead}
  <link rel="stylesheet" href="/masters/assets/workspace.css"><link rel="stylesheet" href="/entries/assets/workspace.css"><script defer src="/entries/assets/workspace-shell.js"></script>
  <link rel="stylesheet" href="/master-data/assets/master-data.css">
  <link rel="stylesheet" href="/masters/assets/records.css">
  <link rel="stylesheet" href="/master-insights/assets/insights.css">
</head><body>
  <a class="skip" href="#workspace">Skip to ${title}</a>
  <header class="masthead">
    <div class="brand"><img src="/masters/assets/pulse.png" alt="" width="36" height="36">
      <span class="wordmark">Caliber <strong>Pulse</strong></span><span class="product">Diesel</span></div>
    <div class="account">${themeToggle}<span>${escape(actor.name)}</span><form method="post" action="/api/sign-out"><button>Sign out</button></form></div>
  </header>
  <div class="layout">
    <main id="workspace" class="master-data-workspace" tabindex="-1" aria-labelledby="workspace-title">
      <header class="workspace-heading master-data-heading">
        ${mastersMenuLink(masterDataPath, 'Back to Master Data')}
        <h1 id="workspace-title">${title}</h1>
        <nav class="insight-views" aria-label="Master Data views">${views.map(([key, name]) =>
          `<a href="${insightsPath}?view=${key}"${key === view ? ' aria-current="page"' : ''}>${name}</a>`).join('')}</nav>
      </header>
      ${notice ? `<p class="record-meta pulse-notice" role="alert">${escape(notice)}</p>` : ''}
      ${view === 'sites' ? sites(data) : view === 'checks' ? checks(data) : overview({ ...data, masterDataPath })}
    </main>
  </div>
</body></html>`;
}
