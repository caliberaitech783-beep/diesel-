import { masters } from './catalog.mjs';
import { pulseMasters as pulseMasterList, pulseMastersPath } from '../pulse-masters/pulse-master-catalog.mjs';

export function masterSidebar({ itemRecordsPath, masterData, masterDataCurrent, localIndentDrafts, masterDataPath = '/master-data', pulseMasters } = {}) {
  // Pulse owns these masters; they lead the Master Data list and open read-only.
  const overviewLink = pulseMasters ? '<li data-fields="overview counts site checklist data checks duplicates"><a href="/master-insights">Overview and checks</a></li>\n' : '';
  const pulseLinks = pulseMasters ? overviewLink + pulseMasterList.map(({ name, slug, columns }) =>
    `<li data-fields="pulse ${columns.map(([, label]) => label).join(' ').replace(/[^\p{L}\p{N} ]/gu, ' ')}"><a href="${pulseMastersPath}?master=${slug}">${name} · Pulse</a></li>`).join('\n') : '';
  const masterLinks = link => masters.map(({ name, slug, sections }) => {
    const fields = sections.flatMap(section => section.fields.map(field => field.label))
      .join(' ').replace(/[^\p{L}\p{N} ]/gu, ' ');
    return `<li data-fields="${fields}"><a href="${link(slug)}">${name}</a></li>`;
  }).join('\n');

  return `<aside class="sidebar" id="masters-sidebar">
      <div class="sidebar-tools">
        <a class="navigation-icon" href="/login" aria-label="Back to login" title="Back to login">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M19 12H5m7-7-7 7 7 7"/>
          </svg>
        </a>
        <input id="master-search" type="search" placeholder="Search masters or fields" aria-label="Search masters or fields" aria-controls="master-list${masterData ? ' master-data-list' : ''}" autocomplete="off" hidden>
        <p id="search-status" role="status"></p>
      </div>
      <nav aria-label="Diesel navigation">
        ${masterData ? `<details class="master-group" name="diesel-sidebar"><summary><span class="folder-icon" aria-hidden="true"></span>Entry</summary><ul aria-label="Entry subtabs"><li data-fields="indent purchase fuel"><a href="/entries">Entry workspace</a></li>${localIndentDrafts ? '<li data-fields="item"><a href="/entries/indents">Diesel Indent drafts</a></li>' : ''}</ul></details>` : ''}
        ${masterData ? `<details class="master-group" name="diesel-sidebar"${masterDataCurrent ? ' open' : ''}>
          <summary><span class="folder-icon" aria-hidden="true"></span>Master Data</summary>
          <ul id="master-data-list" aria-label="Master Data subtabs"${pulseMasters ? ' data-counts="/api/master-insights/counts"' : ''}>${pulseLinks}${masterLinks(slug => masterDataPath + '?master=' + slug)}</ul>
        </details>` : ''}
        <details class="master-group" name="diesel-sidebar"${masterDataCurrent ? '' : ' open'}>
          <summary><span class="folder-icon" aria-hidden="true"></span>Master</summary>
          <ul id="master-list" aria-label="Master subtabs">${masterLinks(slug => slug === 'item-master' && itemRecordsPath ? itemRecordsPath : '/?master=' + slug)}</ul>
        </details>
      </nav>
    </aside>`;
}
