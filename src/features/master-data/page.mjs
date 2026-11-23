import { recordDialogAssets, recordDialogHost } from '../masters/record-dialog.mjs';
import { masterSidebar } from '../masters/master-sidebar.mjs';
import { mastersMenuLink } from '../masters/master-navigation.mjs';
import { recordDraftScope } from '../masters/records-fields.mjs';
import { themeHead, themeToggle } from '../theme/theme-toggle.mjs';
import { masterSiteMenu } from '../masters/master-site-menu.mjs';
import { masterDataFileMenu } from './file-menu.mjs';
import { masterDataSearch } from './search.mjs';
import { tableCellAttributes } from './table-layout.mjs';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);

function savedTable(master, rows, canSave, prefix, canEdit) {
  const records = rows.map(row => {
    const action = canEdit && row.canEdit !== false && !['pending deletion','pending deactivation','inactive','deleted'].includes(row.status) ? 'Edit' : 'View';
    const href = row.recordPath ?? prefix + '/records?' + new URLSearchParams({ master: master.slug, id: row.id });
    const values = new Map(row.fields);
    const cells = master.fields.map(({ key,type }) => {
      if (type==='attributes') {
        const count = JSON.parse(values.get(key)||'[]').length;
        return count ? `<td><a data-record-dialog href="${escape(href)}">${count} attributes</a></td>` : '<td></td>';
      }
      const value = escape(values.get(key));
      return key === master.codeField
        ? `<th scope="row"><a data-record-dialog href="${escape(href)}">${value}</a>${row.missing ? ` <small class="record-incomplete" title="Required fields still empty">Incomplete · ${row.missing}</small>` : ''}</th>`
        : `<td data-label="${escape(key)}"${tableCellAttributes(values.get(key))}>${value}</td>`;
    });
    return `<tr>${cells.join('')}<td><a class="record-edit-link" data-record-dialog href="${escape(href)}" aria-label="${action} ${escape(row.code)}">${action}</a>${row.status === 'pending deletion' ? '<small class="record-pending-delete">Deletion in review</small>' : ''}</td></tr>`;
  }).join('');
  const empty = canSave ? 'No saved records for this master.' : 'This master is available as a form preview.';
  return `<div class="master-data-table" role="region" aria-label="${escape(master.name)} records" tabindex="0">
    <table>
      <thead><tr>${master.fields.map(field => `<th scope="col"${field.key === master.codeField ? ' data-record-key' : ''}>${escape(field.key)}</th>`).join('')}<th scope="col">Actions</th></tr></thead>
      <tbody>${records || `<tr class="master-data-empty"><td colspan="${master.fields.length + 1}">${empty}</td></tr>`}</tbody>
    </table>
  </div>`;
}

export function masterDataPage({ actor, master, canSave, rows, offset, pageSize, hasMore, local, prefix = '', warnings = [], search = '', by = '', sort = '', dir = 'asc', overview }) {
  const heading = master?.name ?? 'Master Data';
  const home = prefix + '/master-data';
  const selection = master ? '?master=' + master.slug : '';
  const view = { ...(search ? { q: search } : {}), ...(by ? { by } : {}) };
  const pageLink = position => home + '?' + new URLSearchParams({ master: master.slug, ...view, ...(sort ? { sort, dir } : {}), offset: position });
  const columns = master?.fields.filter(field => !['file', 'attributes'].includes(field.type)).map(field => [field.key, field.key]);
  const exportPath = master && prefix + '/api/master-data/records?' + new URLSearchParams({ master: master.slug, ...(search ? { q: search } : {}) });
  const canImport = canSave && ((!local && !prefix) || actor.canEditMasters === true);
  const account = local ? `<a href="/workspace">${escape(actor.name ?? actor.id)}</a>`
    : `<span>${escape(actor.name)}</span><form method="post" action="/api/sign-out"><button>Sign out</button></form>`;
  const itemRecordsPath = local || prefix ? prefix + '/records?master=item-master' + (actor.canEditMasters ? '&amp;new=1' : '') : undefined;
  return `<!doctype html>
<html lang="en"><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${master ? escape(heading) + ' · ' : ''}Master Data · Diesel</title><link rel="icon" href="/masters/assets/pulse.png">
  ${themeHead}${recordDialogAssets}
  <link rel="stylesheet" href="/masters/assets/workspace.css">
  <link rel="stylesheet" href="/master-data/assets/master-data.css">
  ${overview ? '<link rel="stylesheet" href="/masters/assets/records.css"><link rel="stylesheet" href="/master-insights/assets/insights.css">' : ''}
  ${prefix ? '<link rel="stylesheet" href="/masters/assets/records.css">' : ''}
  ${master ? '' : '<script type="module" src="/masters/assets/navigation.js"></script>'}
  ${canSave ? '<script type="module" src="/master-data/assets/download.js"></script>' : ''}
  ${canImport ? '<script type="module" src="/master-data/assets/import.js"></script>' : ''}
  ${master && canSave ? '<script type="module" src="/master-data/assets/live-records.js"></script>' : ''}
</head><body>
  <a class="skip" href="#workspace">Skip to Master Data</a>
  <header class="masthead">
    <div class="brand"><img src="/masters/assets/pulse.png" alt="" width="36" height="36">
      <span class="wordmark">Caliber <strong>Pulse</strong></span><span class="product">Diesel</span></div>
    <div class="account">${themeToggle}${account}</div>
  </header>
  <div class="layout">
    ${master ? '' : masterSidebar({ itemRecordsPath, masterData: true, masterDataCurrent: true, masterDataPath:home, pulseMasters: !local })}
    <main id="workspace" class="master-data-workspace" tabindex="-1" aria-labelledby="workspace-title">
      <header class="workspace-heading${master ? ' master-data-heading' : ''}">
        ${master ? mastersMenuLink(home, 'Back to Master Data') : ''}
        <h1 id="workspace-title">${escape(heading)}</h1>
        ${master ? masterDataSearch({ master, action: home, search, columns, by, sort, dir }) : ''}
        ${canSave ? `<div class="master-data-tools" data-export-source="${escape(exportPath)}">
          ${masterDataFileMenu('Download')}
          ${canImport ? masterDataFileMenu('Import', true) : ''}
          ${masterDataFileMenu('Export')}
        </div>` : ''}
      </header>
      ${masterSiteMenu(actor,prefix,'master-data',master?.slug)}
      ${prefix && master ? `<p><a href="${prefix}/records${selection}">Review records</a></p>` : ''}
      ${prefix && actor.hasSubmissions ? `<p><a href="/master-data${selection}">My earlier submissions</a></p>` : ''}
      ${canImport ? `<input type="file" id="master-data-import-file" hidden data-master="${escape(master.slug)}"
        data-review-url="${escape(prefix + '/records?' + new URLSearchParams({ master: master.slug, new: '1' }))}"
        data-scope="${recordDraftScope(actor, master.slug)}"
        data-columns="${escape(JSON.stringify(master.fields.filter(field => field.type !== 'file' && !field.readOnly).map(field => field.key)))}"
        data-fields="${escape(JSON.stringify(master.fields.filter(field => field.type !== 'file' && !field.readOnly)
          .map(({ key, label, type, options }) => ({ key, label: label ?? key, type, options }))))}"
        data-master-name="${escape(master.name)}" data-code-field="${escape(master.codeField)}"
        ${actor.canEditMasters === true ? `data-api="${escape(prefix + '/api/masters/' + master.slug + '/records')}"
        data-record-home="${escape(prefix + '/records?' + new URLSearchParams({ master: master.slug }))}"` : ''}>
      <section id="bulk-import" class="bulk-import" hidden aria-labelledby="bulk-import-title">
        <h2 id="bulk-import-title">Import records</h2>
        <p data-bulk-summary></p>
        <div class="master-data-table" role="region" aria-label="Records to import" tabindex="0"><table>
          <thead><tr><th data-bulk-column scope="col">File row</th><th data-bulk-column scope="col">Record</th><th data-bulk-column scope="col">Result</th></tr></thead><tbody></tbody></table></div>
        <p><button type="button" data-bulk-save>Save all for review</button> <button type="button" data-bulk-cancel>Cancel</button></p>
      </section>` : ''}
      ${canSave ? '<output class="master-data-feedback" aria-live="polite"></output>' : ''}
      ${master ? `<div data-live-records data-live-scope="${recordDraftScope(actor, master.slug)}">` : ''}
      ${warnings.length ? `<details open><summary>Attribute expiry alerts (${warnings.length})</summary><ul>${warnings.map(warning=>{
        const url=prefix+'/records?'+new URLSearchParams({master:master.slug,id:warning.id,revision:warning.revision});
        return `<li><a href="${escape(url)}">${escape(warning.code)}</a> · ${escape(warning.name)}
          ${warning.reference ? ' · '+escape(warning.reference) : ''} · ${escape(warning.due)} · ${escape(warning.status)}</li>`;
      }).join('')}</ul></details>` : ''}
      ${master ? savedTable(master, rows, canSave, prefix, canImport) : (overview ?? '<p>Choose a master from the sidebar to view its saved records.</p>')}
      ${master && (offset || hasMore) ? `<nav class="master-data-pager" aria-label="Master Data pages">
        ${offset ? `<a href="${escape(pageLink(Math.max(0, offset - pageSize)))}">Previous</a>` : ''}
        ${hasMore ? `<a href="${escape(pageLink(offset + pageSize))}">Next</a>` : ''}
      </nav>` : ''}
      ${master ? '</div>' : ''}
    </main>
  </div>
${master ? recordDialogHost : ''}
</body></html>`;
}
