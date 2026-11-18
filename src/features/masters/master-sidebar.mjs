import { masters } from './catalog.mjs';

export function masterSidebar({ itemRecordsPath, masterData, masterDataCurrent } = {}) {
  const links = masters.map(({ name, slug, sections }) => {
    const fields = sections.flatMap(section => section.fields.map(field => field.label))
      .join(' ').replace(/[^\p{L}\p{N} ]/gu, ' ');
    const href = itemRecordsPath && slug === 'item-master' ? itemRecordsPath : `/?master=${slug}`;
    return `<li data-fields="${fields}"><a href="${href}">${name}</a></li>`;
  }).join('\n');

  return `<aside class="sidebar" id="masters-sidebar">
      <div class="sidebar-tools">
        <a class="navigation-icon" href="/login" aria-label="Back to login" title="Back to login">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M19 12H5m7-7-7 7 7 7"/>
          </svg>
        </a>
        <input id="master-search" type="search" placeholder="Search masters or fields" aria-label="Search masters or fields" aria-controls="master-list" autocomplete="off" hidden>
        <p id="search-status" role="status"></p>
      </div>
      <nav aria-label="Diesel navigation">
        ${masterData ? `<a class="master-data-link" href="/master-data"${masterDataCurrent ? ' aria-current="page"' : ''}>Master Data</a>` : ''}
        <details class="master-group"${masterDataCurrent ? '' : ' open'}>
          <summary><span class="folder-icon" aria-hidden="true"></span>Master</summary>
          <ul id="master-list" aria-label="Master subtabs">${links}</ul>
        </details>
      </nav>
    </aside>`;
}
