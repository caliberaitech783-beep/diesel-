import { mastersMenuLink } from '../masters/master-navigation.mjs';
import { masterSidebar } from '../masters/master-sidebar.mjs';
import { themeHead, themeToggle } from '../theme/theme-toggle.mjs';
import { pulseMastersPath } from './pulse-master-catalog.mjs';
import { recordDraftScope } from '../masters/records-fields.mjs';
import { masterDataFileMenu } from '../master-data/file-menu.mjs';
import { masterDataSearch } from '../master-data/search.mjs';
import { tableCellAttributes } from '../master-data/table-layout.mjs';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);

export function pulseMasterPage({ actor, master, rows, total, offset, pageSize, search, syncedAt, notice, site, masterDataPath, by = '', sort = '', dir = 'asc', message = '' }) {
  const link = values => pulseMastersPath + '?' + new URLSearchParams({ master: master.slug, ...(search ? { q: search } : {}),
    ...(by ? { by } : {}), ...(sort ? { sort, dir } : {}), ...values });
  const body = rows.map(row => `<tr>${master.columns.map(([key, label], index) =>
    index ? `<td data-label="${escape(label)}"${tableCellAttributes(row[key])}>${escape(row[key])}</td>` : `<th scope="row">${escape(row[key])}${row.addedInDiesel ? ' <small class="record-incomplete" title="Added in Diesel by ' + escape(row.addedBy) + '">Added in Diesel</small>' : ''}</th>`).join('')}<td>${row.addedInDiesel
      ? `<form method="post" action="${pulseMastersPath}/remove"><input type="hidden" name="master" value="${master.slug}"><input type="hidden" name="id" value="${row.addedInDiesel}"><button class="pulse-remove" aria-label="Remove ${escape(row[master.columns[0][0]])}">Remove</button></form>` : ''}</td></tr>`).join('');
  const empty = syncedAt ? 'No records match.' : 'Records are temporarily unavailable. Retrying automatically.';
  return `<!doctype html>
<html lang="en"><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escape(master.name)} · Pulse masters · Diesel</title><link rel="icon" href="/masters/assets/pulse.png">
  ${themeHead}
  <link rel="stylesheet" href="/masters/assets/workspace.css">
  <link rel="stylesheet" href="/master-data/assets/master-data.css">
  <link rel="stylesheet" href="/masters/assets/records.css">
  <script type="module" src="/master-data/assets/live-records.js"></script>
  <script type="module" src="/master-data/assets/download.js"></script>
  <script type="module" src="/master-data/assets/pulse-import.js"></script>
  <script type="module" src="/masters/assets/navigation.js"></script><script type="module" src="/masters/assets/sidebar-toggle.js"></script>
</head><body>
  <a class="skip" href="#workspace">Skip to ${escape(master.name)}</a>
  <header class="masthead">
    <div class="brand"><img src="/masters/assets/pulse.png" alt="" width="36" height="36">
      <span class="wordmark">Caliber <strong>Pulse</strong></span><span class="product">Diesel</span></div>
    <div class="account">${themeToggle}<span>${escape(actor.name)}</span><form method="post" action="/api/sign-out"><button>Sign out</button></form></div>
  </header>
  <div class="layout">
    ${masterSidebar({ hidden: true, masterData: true, masterDataPath, pulseMasters: true })}
    <main id="workspace" class="master-data-workspace" tabindex="-1" aria-labelledby="workspace-title">
      <header class="workspace-heading master-data-heading">
        ${mastersMenuLink(masterDataPath, 'Back to Master Data')}
        <h1 id="workspace-title">${escape(master.name)}</h1>
        ${masterDataSearch({ master, action: pulseMastersPath, search, columns: master.columns, by, sort, dir })}
        <div class="master-data-tools" data-export-source="${escape(pulseMastersPath + '/records?' + new URLSearchParams({ master: master.slug }))}" data-export-name="${master.slug}-master">
          ${masterDataFileMenu('Download')}
          <label class="pulse-import">Import CSV / Excel<input type="file" id="pulse-import-file" accept=".csv,.xlsx" hidden data-master="${master.slug}"
            data-name="${escape(master.name)}" data-columns="${escape(JSON.stringify(master.columns))}"></label>
        </div>
      </header>
      ${site ? `<p class="record-meta">Site · ${escape(site)}</p>` : ''}
      <details class="pulse-add"><summary>Add a record manually</summary>
        <form method="post" action="${pulseMastersPath}/add"><input type="hidden" name="master" value="${master.slug}">
          ${master.columns.map(([key, label], index) => `<label>${escape(label)}<input name="${key}" maxlength="1024" autocomplete="off"${index ? '' : ' required'}></label>`).join('')}
          <button>Add record</button></form>
        <p class="record-meta">To import, use a CSV or Excel file whose first row has these column names. Records added here are kept when Pulse is fetched again.</p></details>
      <output class="master-data-feedback" aria-live="polite" id="pulse-import-status">${escape(message)}</output>
      <div data-live-records data-live-scope="${recordDraftScope({ ...actor, site }, master.slug)}">
      ${notice ? `<p class="record-meta" data-live-warning role="alert">${escape(notice)}</p>` : ''}
      <div class="master-data-table" role="region" aria-label="${escape(master.name)} records" tabindex="0">
        <table>
          <thead><tr>${master.columns.map(([, label], index) => `<th scope="col"${index === 0 ? ' data-record-key' : ''}>${escape(label)}</th>`).join('')}<th scope="col" aria-label="Actions"></th></tr></thead>
          <tbody>${body || `<tr class="master-data-empty"><td colspan="${master.columns.length + 1}">${empty}</td></tr>`}</tbody>
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
