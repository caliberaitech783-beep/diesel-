import { masterSidebar } from '../masters/master-sidebar.mjs';
import { mastersMenuLink } from '../masters/master-navigation.mjs';
import { themeHead, themeToggle } from '../theme/theme-toggle.mjs';
import { pulseMastersPath } from './pulse-master-catalog.mjs';
import { recordDraftScope } from '../masters/records-fields.mjs';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);

export function pulseMasterPage({ actor, master, rows, total, offset, pageSize, search, syncedAt, notice, site, masterDataPath }) {
  const link = values => pulseMastersPath + '?' + new URLSearchParams({ master: master.slug, ...(search ? { q: search } : {}), ...values });
  const body = rows.map(row => `<tr>${master.columns.map(([key], index) =>
    index ? `<td>${escape(row[key])}</td>` : `<th scope="row">${escape(row[key])}</th>`).join('')}</tr>`).join('');
  const empty = syncedAt ? 'No records match.' : 'Records are temporarily unavailable. Retrying automatically.';
  return `<!doctype html>
<html lang="en"><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escape(master.name)} · Pulse masters · Diesel</title><link rel="icon" href="/masters/assets/pulse.png">
  ${themeHead}
  <link rel="stylesheet" href="/masters/assets/workspace.css">
  <link rel="stylesheet" href="/master-data/assets/master-data.css">
  <link rel="stylesheet" href="/masters/assets/records.css">
  <script type="module" src="/masters/assets/navigation.js"></script>
  <script type="module" src="/master-data/assets/live-records.js"></script>
</head><body>
  <a class="skip" href="#workspace">Skip to ${escape(master.name)}</a>
  <header class="masthead">
    <div class="brand"><img src="/masters/assets/pulse.png" alt="" width="36" height="36">
      <span class="wordmark">Caliber <strong>Pulse</strong></span><span class="product">Diesel</span></div>
    <div class="account">${themeToggle}<span>${escape(actor.name)}</span><form method="post" action="/api/sign-out"><button>Sign out</button></form></div>
  </header>
  <div class="layout">
    ${masterSidebar({ masterData: true, masterDataCurrent: true, masterDataPath, pulseMasters: true })}
    <main id="workspace" class="master-data-workspace" tabindex="-1" aria-labelledby="workspace-title">
      <header class="workspace-heading master-data-heading">
        ${mastersMenuLink(masterDataPath, 'Back to Master Data')}
        <h1 id="workspace-title">${escape(master.name)}</h1>
        <div class="master-data-tools">
          <span class="live-status" data-live-status role="status" title="Updates automatically every 30 seconds">${notice ? 'Reconnecting…' : 'Live'}</span>
          <a class="master-data-download" href="${escape(pulseMastersPath + '/download?' + new URLSearchParams({ master: master.slug }))}">Download CSV</a>
        </div>
      </header>
      <form class="record-tools master-data-search" method="get" action="${pulseMastersPath}">
        <input type="hidden" name="master" value="${master.slug}">
        <label>Search <input type="search" name="q" value="${escape(search)}" maxlength="256"></label><button>Search</button>
        ${site ? `<span class="record-meta">Site · ${escape(site)}</span>` : ''}
      </form>
      <div data-live-records data-live-scope="${recordDraftScope({ ...actor, site }, master.slug)}">
      ${notice ? `<p class="record-meta" data-live-warning role="alert">${escape(notice)}</p>` : ''}
      <div class="master-data-table" role="region" aria-label="${escape(master.name)} records" tabindex="0">
        <table>
          <thead><tr>${master.columns.map(([, label]) => `<th scope="col">${escape(label)}</th>`).join('')}</tr></thead>
          <tbody>${body || `<tr class="master-data-empty"><td colspan="${master.columns.length}">${empty}</td></tr>`}</tbody>
        </table>
      </div>
      ${offset || offset + pageSize < total ? `<nav class="master-data-pager" aria-label="${escape(master.name)} pages">
        ${offset ? `<a href="${escape(link({ offset: Math.max(0, offset - pageSize) }))}">Previous</a>` : ''}
        ${offset + pageSize < total ? `<a href="${escape(link({ offset: offset + pageSize }))}">Next</a>` : ''}
      </nav>` : ''}
      </div>
    </main>
  </div>
</body></html>`;
}
