import { masters } from './catalog.mjs';
import { pulseMasters as pulseMasterList, pulseMastersPath, replacedByPulse } from '../pulse-masters/pulse-master-catalog.mjs';

const icon = paths => `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export function masterSidebar({ itemRecordsPath, masterData, masterDataCurrent, localIndentDrafts, masterDataPath = '/master-data', pulseMasters, hidden = false, checksCurrent = false } = {}) {
  const back = `<a class="navigation-icon" href="/login" aria-label="Back to login" title="Back to login">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M19 12H5m7-7-7 7 7 7"/>
          </svg>
        </a>`;
  // In the signed-in Diesel site the menu is short: the masters themselves are the cards on the Diesel Master Data page,
  // and a new record is added from "+ Add new" on each master. On a form or a single master's page the menu
  // starts hidden; the ☰ beside the title shows and hides it.
  if (masterData && pulseMasters) return `<aside class="sidebar" id="masters-sidebar"${hidden ? ' hidden' : ''}>
      <div class="sidebar-tools">${back}</div>
      <nav aria-label="Diesel navigation">
        <div class="main-links"><a href="/entries/dashboard">${icon('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>')}Dashboard</a>
        <a href="/entries/workspace">${icon('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>')}Diesel Workspace</a>
        <a href="/entries">${icon('<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>')}Entry register</a>
        <a href="${masterDataPath}"${masterDataCurrent && !checksCurrent ? ' aria-current="page"' : ''}>${icon('<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>')}Diesel Master Data</a>
        ${`<a href="/master-insights?view=checks"${checksCurrent ? ' aria-current="page"' : ''}>${icon('<path d="M12 3 5 6v6c0 4.400 3 7.600 7 9 4-1.400 7-4.600 7-9V6z"/><path d="m9 12 2 2 4-4"/>')}Data overview</a>`}</div>
        <details class="master-group" name="diesel-sidebar" open><summary><span class="folder-icon" aria-hidden="true"></span>Approvers</summary><ul aria-label="Approver lists"><li><a href="/indent-approvers">Indent approvers</a></li><li><a href="/po-approvers">PO approvers</a></li></ul></details>
      </nav>
    </aside>`;


  // Elsewhere (the local workspace, or a site without Master Data) the menu still lists every master.
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
        ${masterData ? `<div class="main-links"><a href="/entries/dashboard">${icon('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>')}Dashboard</a>
        <a href="/entries/workspace">${icon('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>')}Diesel Workspace</a>
        <a href="${masterDataPath}"${masterDataCurrent ? ' aria-current="page"' : ''}>${icon('<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>')}Diesel Master Data</a></div>` : ''}
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
