import { masterSidebar } from '../masters/master-sidebar.mjs';
import { mastersMenuLink } from '../masters/master-navigation.mjs';
import { recordDraftScope } from '../masters/records-fields.mjs';
import { themeHead, themeToggle } from '../theme/theme-toggle.mjs';
import { masterSiteMenu } from '../masters/master-site-menu.mjs';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);

function fileMenu(label, importing = false) {
  const attribute = importing ? 'data-import-format' : 'data-format';
  return `<details class="master-data-menu" name="master-data-file-actions">
    <summary>${label}</summary>
    <div>${[['Excel', 'xlsx'], ['CSV', 'csv'], ['PDF', 'pdf']].map(([name, format]) =>
      `<button type="button" ${attribute}="${format}" aria-label="${label} ${name}">${name}</button>`).join('')}</div>
  </details>`;
}

function savedTable(master, rows, canSave, prefix) {
  const records = rows.map(row => {
    const href = prefix + '/records?' + new URLSearchParams({ master: master.slug, id: row.id });
    const values = new Map(row.fields);
    const cells = master.fields.map(({ key,type }) => {
      if (type==='attributes') {
        const count = JSON.parse(values.get(key)||'[]').length;
        return count ? `<td><a href="${escape(href)}">${count} attributes</a></td>` : '<td></td>';
      }
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

export function masterDataPage({ actor, master, canSave, rows, offset, pageSize, hasMore, local, prefix = '', warnings = [] }) {
  const heading = master?.name ?? 'Master Data';
  const home = prefix + '/master-data';
  const selection = master ? '?master=' + master.slug : '';
  const pageLink = position => home + '?' + new URLSearchParams({ master: master.slug, offset: position });
  const exportPath = master && prefix + '/api/master-data/records?' + new URLSearchParams({ master: master.slug });
  const canImport = canSave && ((!local && !prefix) || actor.canEditMasters === true);
  const account = local ? `<a href="/workspace">${escape(actor.name ?? actor.id)}</a>`
    : `<span>${escape(actor.name)}</span><form method="post" action="/api/sign-out"><button>Sign out</button></form>`;
  const itemRecordsPath = local || prefix ? prefix + '/records?master=item-master' + (actor.canEditMasters ? '&amp;new=1' : '') : undefined;
  return `<!doctype html>
<html lang="en"><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${master ? escape(heading) + ' · ' : ''}Master Data · Diesel</title><link rel="icon" href="/masters/assets/pulse.png">
  ${themeHead}
  <link rel="stylesheet" href="/masters/assets/workspace.css">
  <link rel="stylesheet" href="/master-data/assets/master-data.css">
  ${prefix ? '<link rel="stylesheet" href="/masters/assets/records.css">' : ''}
  ${master ? '' : '<script type="module" src="/masters/assets/navigation.js"></script>'}
  ${canSave ? '<script type="module" src="/master-data/assets/download.js"></script>' : ''}
  ${canImport ? '<script type="module" src="/master-data/assets/import.js"></script>' : ''}
</head><body>
  <a class="skip" href="#workspace">Skip to Master Data</a>
  <header class="masthead">
    <div class="brand"><img src="/masters/assets/pulse.png" alt="" width="36" height="36">
      <span class="wordmark">Caliber <strong>Pulse</strong></span><span class="product">Diesel</span></div>
    <div class="account">${themeToggle}${account}</div>
  </header>
  <div class="layout">
    ${master ? '' : masterSidebar({ itemRecordsPath, masterData: true, masterDataCurrent: true, masterDataPath:home, pulseMasters: !local })}
    <main id="workspace" tabindex="-1" aria-labelledby="workspace-title">
      ${master ? mastersMenuLink(home, 'Back to Master Data') : ''}
      <header class="workspace-heading">
        <h1 id="workspace-title">${escape(heading)}</h1>
        ${canSave ? `<div class="master-data-tools" data-export-source="${escape(exportPath)}">
          ${fileMenu('Download')}
          ${canImport ? fileMenu('Import', true) : ''}
          ${fileMenu('Export')}
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
      ${warnings.length ? `<details open><summary>Attribute expiry alerts (${warnings.length})</summary><ul>${warnings.map(warning=>{
        const url=prefix+'/records?'+new URLSearchParams({master:master.slug,id:warning.id,revision:warning.revision});
        return `<li><a href="${escape(url)}">${escape(warning.code)}</a> · ${escape(warning.name)}
          ${warning.reference ? ' · '+escape(warning.reference) : ''} · ${escape(warning.due)} · ${escape(warning.status)}</li>`;
      }).join('')}</ul></details>` : ''}
      ${master ? savedTable(master, rows, canSave, prefix) : '<p>Choose a master from the sidebar to view its saved records.</p>'}
      ${master && (offset || hasMore) ? `<nav class="master-data-pager" aria-label="Master Data pages">
        ${offset ? `<a href="${escape(pageLink(Math.max(0, offset - pageSize)))}">Previous</a>` : ''}
        ${hasMore ? `<a href="${escape(pageLink(offset + pageSize))}">Next</a>` : ''}
      </nav>` : ''}
    </main>
  </div>
</body></html>`;
}
