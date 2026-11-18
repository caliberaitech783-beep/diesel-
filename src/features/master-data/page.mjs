import { masterSidebar } from '../masters/master-sidebar.mjs';
import { themeHead, themeToggle } from '../theme/theme-toggle.mjs';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const dateFormat = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });

export function masterDataPage({ actor, master, masters, rows, offset, pageSize, hasMore, local }) {
  const pageLink = position => '/master-data?' + new URLSearchParams({ master, offset: position });
  const exportPath = '/api/master-data/records?' + new URLSearchParams({ master });
  const account = local ? `<a href="/workspace">${escape(actor.name ?? actor.id)}</a>`
    : `<span>${escape(actor.name)}</span><form method="post" action="/api/sign-out"><button>Sign out</button></form>`;
  const itemRecordsPath = local ? '/records?master=item-master' + (actor.canEditMasters ? '&amp;new=1' : '') : undefined;
  const records = rows.map(row => {
    const href = '/records?' + new URLSearchParams({ master: row.slug, id: row.id });
    const updated = dateFormat.format(new Date(row.updatedAt));
    const fields = row.fields.filter(([, value]) => value !== '').map(([label, value]) =>
      `<dt>${escape(label)}</dt><dd>${escape(value)}</dd>`).join('');
    return `<tr>
      <td>${escape(row.master)}</td>
      <th scope="row"><a href="${escape(href)}">${escape(row.code)}</a></th>
      <td>${escape(row.name)}</td>
      ${local ? `<td>${escape(row.site)}</td>` : ''}
      <td class="master-data-status">${escape(row.status)}</td>
      <td>${row.revision}</td>
      <td><time datetime="${escape(row.updatedAt)}">${escape(updated)}</time></td>
      <td><details class="saved-fields"><summary>View fields</summary><dl>${fields}</dl></details></td>
    </tr>`;
  }).join('');
  return `<!doctype html>
<html lang="en"><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Master Data · Diesel</title><link rel="icon" href="/masters/assets/pulse.png">
  ${themeHead}
  <link rel="stylesheet" href="/masters/assets/workspace.css">
  <link rel="stylesheet" href="/master-data/assets/master-data.css">
  <script type="module" src="/masters/assets/navigation.js"></script>
  <script type="module" src="/master-data/assets/download.js"></script>
</head><body>
  <a class="skip" href="#workspace">Skip to Master Data</a>
  <header class="masthead">
    <div class="brand"><img src="/masters/assets/pulse.png" alt="" width="36" height="36">
      <span class="wordmark">Caliber <strong>Pulse</strong></span><span class="product">Diesel</span></div>
    <div class="account">${themeToggle}${account}</div>
  </header>
  <div class="layout">
    ${masterSidebar({ itemRecordsPath, masterData: true, masterDataCurrent: true })}
    <main id="workspace" tabindex="-1" aria-labelledby="workspace-title">
      <header class="workspace-heading"><h1 id="workspace-title">Master Data</h1></header>
      <div class="master-data-tools">
        <form action="/master-data" method="get">
          <label for="master-data-filter">Master</label>
          <select id="master-data-filter" name="master"><option value="">All masters</option>
            ${masters.map(item => `<option value="${escape(item.slug)}"${master === item.slug ? ' selected' : ''}>${escape(item.name)}</option>`).join('')}
          </select>
          <button type="submit">Filter</button>
        </form>
        <details class="master-data-download" data-export-source="${escape(exportPath)}">
          <summary>Download</summary>
          <div>
            ${[['Excel', 'xlsx'], ['CSV', 'csv'], ['PDF', 'pdf']].map(([name, format]) =>
              `<button type="button" data-format="${format}">${name}</button>`).join('')}
          </div>
        </details>
      </div>
      <output class="master-data-feedback" aria-live="polite"></output>
      ${records ? `<div class="master-data-table" role="region" aria-label="Saved master records" tabindex="0">
        <table>
          <thead><tr><th scope="col">Master</th><th scope="col">Code</th><th scope="col">Name</th>
            ${local ? '<th scope="col">Site</th>' : ''}
            <th scope="col">Status</th><th scope="col">Revision</th><th scope="col">Last saved</th><th scope="col">Fields</th>
          </tr></thead>
          <tbody>${records}</tbody>
        </table>
      </div>` : '<p class="master-data-empty">No saved records in this view.</p>'}
      ${offset || hasMore ? `<nav class="master-data-pager" aria-label="Master Data pages">
        ${offset ? `<a href="${escape(pageLink(Math.max(0, offset - pageSize)))}">Previous</a>` : ''}
        ${hasMore ? `<a href="${escape(pageLink(offset + pageSize))}">Next</a>` : ''}
      </nav>` : ''}
    </main>
  </div>
</body></html>`;
}
