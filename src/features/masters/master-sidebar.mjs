import { masters } from './catalog.mjs';
import { pulseMasters as pulseMasterList, pulseMastersPath, replacedByPulse } from '../pulse-masters/pulse-master-catalog.mjs';

export function masterSidebar({ itemRecordsPath, masterData, masterDataCurrent, localIndentDrafts, masterDataPath = '/master-data', pulseMasters, hidden = false } = {}) {
  // Existing location records still support storage and entry approvals; only Pulse locations are listed.
  const listedMasters = masters.filter(({ slug }) => slug !== 'location-master');
  // Pulse-owned masters open read-only and sort alongside Diesel masters.
  const overviewLink = pulseMasters ? '<li data-fields="overview counts site checklist data checks duplicates"><a href="/master-insights">Overview and checks</a></li>\n' : '';
  const pulseMasterLinks = (list, suffix) => list.map(({ name, slug, columns }) => ({
    name: name + suffix,
    html: `<li data-fields="pulse ${columns.map(([, label]) => label).join(' ').replace(/[^\p{L}\p{N} ]/gu, ' ')}"><a href="${pulseMastersPath}?master=${slug}">${name}${suffix}</a></li>`,
  }));
  const pulseLinks = pulseMasters ? pulseMasterLinks(pulseMasterList, ' · Pulse') : [];
  const locationLink = pulseMasters ? pulseMasterLinks(pulseMasterList.filter(({ slug }) => slug === 'site'), '') : [];
  const masterLinks = (link, list = listedMasters) => list.map(({ name, slug, sections }) => {
    const fields = sections.flatMap(section => section.fields.map(field => field.label))
      .join(' ').replace(/[^\p{L}\p{N} ]/gu, ' ');
    return { name, html: `<li data-fields="${fields}"><a href="${link(slug)}">${name}</a></li>` };
  });
  const renderLinks = links => links.toSorted((a, b) => a.name.localeCompare(b.name, 'en'))
    .map(({ html }) => html).join('\n');

  // On a form or a single master's page the menu starts hidden; the ☰ beside the title shows and hides it.
  return `<aside class="sidebar" id="masters-sidebar"${hidden ? ' hidden' : ''}>
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
        ${masterData ? `<details class="master-group" name="diesel-sidebar"><summary><span class="folder-icon" aria-hidden="true"></span>Entry</summary><ul aria-label="Entry subtabs"><li data-fields="indent purchase fuel"><a href="/entries">Entry workspace</a></li>${pulseMasters ? '<li data-fields="indent approvers telegram approval"><a href="/indent-approvers">Indent approvers</a></li><li data-fields="purchase order po approvers telegram approval"><a href="/po-approvers">PO approvers</a></li>' : ''}${localIndentDrafts ? '<li data-fields="item"><a href="/entries/indents">Diesel Indent drafts</a></li>' : ''}</ul></details>` : ''}
        ${masterData ? `<details class="master-group" name="diesel-sidebar"${masterDataCurrent ? ' open' : ''}>
          <summary><span class="folder-icon" aria-hidden="true"></span>Master Data</summary>
          <ul id="master-data-list" aria-label="Master Data subtabs"${pulseMasters ? ' data-counts="/api/master-insights/counts"' : ''}>${overviewLink}${renderLinks([...masterLinks(slug => masterDataPath + '?master=' + slug, pulseMasters ? listedMasters.filter(({ name }) => !replacedByPulse(name)) : listedMasters), ...pulseLinks])}</ul>
        </details>` : ''}
        <details class="master-group" name="diesel-sidebar"${masterDataCurrent ? '' : ' open'}>
          <summary><span class="folder-icon" aria-hidden="true"></span>Master</summary>
          <ul id="master-list" aria-label="Master subtabs">${renderLinks([...masterLinks(slug => slug === 'item-master' && itemRecordsPath ? itemRecordsPath : '/?master=' + slug), ...locationLink])}</ul>
        </details>
      </nav>
    </aside>`;
}
