import { masterSidebar } from '../masters/master-sidebar.mjs';
import { mastersMenuLink } from '../masters/master-navigation.mjs';
import { themeHead, themeToggle } from '../theme/theme-toggle.mjs';
import { pulseMastersPath } from './pulse-master-catalog.mjs';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const istTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });

export function pulseMasterPage({ actor, master, rows, total, offset, pageSize, search, syncedAt, notice, site, masterDataPath }) {
  const link = values => pulseMastersPath + '?' + new URLSearchParams({ master: master.slug, ...(search ? { q: search } : {}), ...values });
  const body = rows.map(row => `<tr>${master.columns.map(([key], index) =>
    index ? `<td>${escape(row[key])}</td>` : `<th scope="row">${escape(row[key])}</th>`).join('')}</tr>`).join('');
  const empty = syncedAt ? 'No Pulse records match.' : 'Pulse records have not been fetched yet. Select Refresh from Pulse.';
  return `<!doctype html>
<html lang="en"><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escape(master.name)} · Pulse masters · Diesel</title><link rel="icon" href="/masters/assets/pulse.png">
  ${themeHead}
  <link rel="stylesheet" href="/masters/assets/workspace.css">
  <link rel="stylesheet" href="/master-data/assets/master-data.css">
  <link rel="stylesheet" href="/masters/assets/records.css">
  <script type="module" src="/masters/assets/navigation.js"></script>
</head><body>
  <a class="skip" href="#workspace">Skip to ${escape(master.name)}</a>
  <header class="masthead">
    <div class="brand"><img src="/masters/assets/pulse.png" alt="" width="36" height="36">
      <span class="wordmark">Caliber <strong>Pulse</strong></span><span class="product">Diesel</span></div>
    <div class="account">${themeToggle}<span>${escape(actor.name)}</span><form method="post" action="/api/sign-out"><button>Sign out</button></form></div>
  </header>
  <div class="layout">
    ${masterSidebar({ masterData: true, masterDataCurrent: true, masterDataPath, pulseMasters: true })}
    <main id="workspace" tabindex="-1" aria-labelledby="workspace-title">
      ${mastersMenuLink(masterDataPath, 'Back to Master Data')}
      <header class="workspace-heading">
        <h1 id="workspace-title">${escape(master.name)}</h1>
        <div class="master-data-tools record-tools">
          <form method="post" action="${pulseMastersPath}/refresh"><input type="hidden" name="master" value="${master.slug}"><button>Refresh from Pulse</button></form>
          <a href="${escape(pulseMastersPath + '/download?' + new URLSearchParams({ master: master.slug }))}">Download CSV</a>
        </div>
      </header>
      <p class="record-meta">From Pulse · read-only · ${total} record${total === 1 ? '' : 's'}${site ? ' · Site · ' + escape(site) : ''}${
        syncedAt ? ' · Fetched ' + escape(istTime.format(new Date(syncedAt))) + ' IST' : ''}. Make changes in Pulse.</p>
      ${notice ? `<p role="alert">${escape(notice)}</p>` : ''}
      <form class="record-tools" method="get" action="${pulseMastersPath}">
        <input type="hidden" name="master" value="${master.slug}">
        <label>Search <input type="search" name="q" value="${escape(search)}" maxlength="256"></label><button>Search</button>
      </form>
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
    </main>
  </div>
</body></html>`;
}
