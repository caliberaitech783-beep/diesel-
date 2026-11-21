import { mastersMenuLink } from '../masters/master-navigation.mjs';
import { themeHead, themeToggle } from '../theme/theme-toggle.mjs';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
export const insightsPath = '/master-insights';
const views = [['overview', 'Overview'], ['sites', 'Site checklist'], ['checks', 'Data checks']];
const istTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
const table = (label, headings, rows) => `<div class="master-data-table" role="region" aria-label="${escape(label)}" tabindex="0"><table>
  <thead><tr>${headings.map(heading => `<th scope="col">${escape(heading)}</th>`).join('')}</tr></thead>
  <tbody>${rows.map(cells => `<tr>${cells.map((cell, index) => {
    const body = cell?.html ?? escape(cell);
    return index ? `<td data-label="${escape(headings[index])}">${body}</td>` : `<th scope="row">${body}</th>`;
  }).join('')}</tr>`).join('') || `<tr class="master-data-empty"><td colspan="${headings.length}">Nothing to show yet.</td></tr>`}</tbody></table></div>`;

// Also shown on the Master Data home, so the page is never empty.
export function overview({ pulse, masters, masterDataPath }) {
  return `<h2>From Pulse</h2>
    ${table('Pulse masters', ['Master', 'Records', 'Last fetched'], pulse.map(row => [
      { html: `<a href="/pulse-masters?master=${row.slug}">${escape(row.name)}</a>` }, row.count,
      row.syncedAt ? istTime.format(new Date(row.syncedAt)) + ' IST' : 'Not fetched yet']))}
    <h2>Diesel masters</h2>
    ${table('Diesel masters', ['Master', 'Records', 'Incomplete'], masters.map(row => [
      { html: `<a href="${escape(masterDataPath + '?master=' + row.slug)}">${escape(row.name)}</a>` }, row.count,
      row.incomplete ? { html: `<span class="record-incomplete">${row.incomplete} missing required fields</span>` } : '']))}`;
}

function sites({ checklist }) {
  const ready = checklist.filter(row => !row.missing.length).length;
  return `<p class="record-meta">${ready} of ${checklist.length} sites have equipment, drivers, shifts and storage locations.</p>
    ${table('Site checklist', ['Site', 'Region', 'Equipment', 'Drivers', 'Active shifts', 'Storage locations', 'Still missing'], checklist.map(row => [
      row.site, row.region, row.equipment, row.drivers, row.shifts, row.storage,
      row.missing.length ? { html: `<span class="record-incomplete">${escape(row.missing.join(', '))}</span>` } : 'Ready']))}`;
}

function checks({ findings }) {
  const open = findings.filter(check => check.count);
  return `<p class="record-meta">${open.length ? open.length + ' of ' + findings.length + ' checks found something to review.' : 'All ' + findings.length + ' checks are clear.'}</p>
    ${findings.map(check => `<details class="insight-check"${check.count ? ' open' : ''}>
      <summary>${escape(check.title)} <span class="${check.count ? 'record-incomplete' : 'insight-clear'}">${check.count || 'Clear'}</span></summary>
      ${check.count ? `<p class="record-meta">${escape(check.help)}</p><ul>${check.items.slice(0, 100).map(item => `<li>${escape(item)}</li>`).join('')}</ul>
        ${check.count > 100 ? `<p class="record-meta">Showing the first 100 of ${check.count}.</p>` : ''}` : ''}
    </details>`).join('')}`;
}

export function insightsPage({ actor, view, notice, masterDataPath, ...data }) {
  const title = views.find(([key]) => key === view)[1];
  return `<!doctype html>
<html lang="en"><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} · Master Data · Diesel</title><link rel="icon" href="/masters/assets/pulse.png">
  ${themeHead}
  <link rel="stylesheet" href="/masters/assets/workspace.css">
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
      ${notice ? `<p class="record-meta" role="alert">${escape(notice)}</p>` : ''}
      ${view === 'sites' ? sites(data) : view === 'checks' ? checks(data) : overview({ ...data, masterDataPath })}
    </main>
  </div>
</body></html>`;
}
