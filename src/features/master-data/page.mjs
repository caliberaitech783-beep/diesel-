import { masterSidebar } from '../masters/master-sidebar.mjs';
import { mastersMenuLink } from '../masters/master-navigation.mjs';
import { themeHead, themeToggle } from '../theme/theme-toggle.mjs';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
function savedTable(master, rows, canSave) {
  const records = rows.map(row => {
    const href = '/records?' + new URLSearchParams({ master: master.slug, id: row.id });
    const values = new Map(row.fields);
    const cells = master.fields.map(({ key }) => {
      const value = escape(values.get(key));
      return key === master.codeField
        ? `<th scope="row"><a href="${escape(href)}">${value}</a></th>`
        : `<td>${value}</td>`;
    });
    return `<tr>${cells.join('')}</tr>`;
  }).join('');
  const empty = canSave ? 'No saved records for this master.' : 'This master is available as a form preview.';
  return `<div class="master-data-table" role="region" aria-label="${escape(master.name)} records" tabindex="0">
    <table>
      <thead><tr>${master.fields.map(field => `<th scope="col">${escape(field.key)}</th>`).join('')}</tr></thead>
      <tbody>${records || `<tr class="master-data-empty"><td colspan="${master.fields.length}">${empty}</td></tr>`}</tbody>
    </table>
  </div>`;
}

export function masterDataPage({ actor, master, canSave, rows, offset, pageSize, hasMore, local }) {
  const heading = master?.name ?? 'Master Data';
  const pageLink = position => '/master-data?' + new URLSearchParams({ master: master.slug, offset: position });
  const exportPath = master && '/api/master-data/records?' + new URLSearchParams({ master: master.slug });
  const account = local ? `<a href="/workspace">${escape(actor.name ?? actor.id)}</a>`
    : `<span>${escape(actor.name)}</span><form method="post" action="/api/sign-out"><button>Sign out</button></form>`;
  const itemRecordsPath = local ? '/records?master=item-master' + (actor.canEditMasters ? '&amp;new=1' : '') : undefined;
  return `<!doctype html>
<html lang="en"><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${master ? escape(heading) + ' · ' : ''}Master Data · Diesel</title><link rel="icon" href="/masters/assets/pulse.png">
  ${themeHead}
  <link rel="stylesheet" href="/masters/assets/workspace.css">
  <link rel="stylesheet" href="/master-data/assets/master-data.css">
  ${master ? '' : '<script type="module" src="/masters/assets/navigation.js"></script>'}
  ${canSave ? '<script type="module" src="/master-data/assets/download.js"></script>' : ''}
</head><body>
  <a class="skip" href="#workspace">Skip to Master Data</a>
  <header class="masthead">
    <div class="brand"><img src="/masters/assets/pulse.png" alt="" width="36" height="36">
      <span class="wordmark">Caliber <strong>Pulse</strong></span><span class="product">Diesel</span></div>
    <div class="account">${themeToggle}${account}</div>
  </header>
  <div class="layout">
    ${master ? '' : masterSidebar({ itemRecordsPath, masterData: true, masterDataCurrent: true })}
    <main id="workspace" tabindex="-1" aria-labelledby="workspace-title">
      ${master ? mastersMenuLink('/master-data', 'Back to Master Data') : ''}
      <header class="workspace-heading">
        <h1 id="workspace-title">${escape(heading)}</h1>
        ${canSave ? `<details class="master-data-download" data-export-source="${escape(exportPath)}">
          <summary>Download</summary>
          <div>
            ${[['Excel', 'xlsx'], ['CSV', 'csv'], ['PDF', 'pdf']].map(([name, format]) =>
              `<button type="button" data-format="${format}">${name}</button>`).join('')}
          </div>
        </details>` : ''}
      </header>
      ${canSave ? '<output class="master-data-feedback" aria-live="polite"></output>' : ''}
      ${master ? savedTable(master, rows, canSave) : '<p>Choose a master from the sidebar to view its saved records.</p>'}
      ${master && (offset || hasMore) ? `<nav class="master-data-pager" aria-label="Master Data pages">
        ${offset ? `<a href="${escape(pageLink(Math.max(0, offset - pageSize)))}">Previous</a>` : ''}
        ${hasMore ? `<a href="${escape(pageLink(offset + pageSize))}">Next</a>` : ''}
      </nav>` : ''}
    </main>
  </div>
</body></html>`;
}
