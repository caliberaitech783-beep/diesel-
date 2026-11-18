import { masters } from './catalog.mjs';

export function masterSidebar({ selectedSlug }) {
  const links = masters.map(({ name, slug, sections }) => {
    const fields = sections.flatMap(section => section.fields.map(field => field.label))
      .join(' ').replace(/[^\p{L}\p{N} ]/gu, ' ');
    const current = slug === selectedSlug ? ' aria-current="page"' : '';
    return `<li data-fields="${fields}"><a href="?master=${slug}"${current}>${name}</a></li>`;
  }).join('\n');
  const shortcut = '<a class="sidebar-shortcut" href="https://pulse.cmll.in/"><span aria-hidden="true">←</span> Back to Pulse</a>';

  return `<aside class="sidebar" id="masters-sidebar">
      <div class="sidebar-tools">
        ${shortcut}
        <input id="master-search" type="search" placeholder="Search masters or fields" aria-label="Search masters or fields" aria-controls="master-list" autocomplete="off" hidden>
        <p id="search-status" role="status"></p>
      </div>
      <nav aria-label="Diesel navigation">
        <details class="master-group" open>
          <summary><span class="folder-icon" aria-hidden="true"></span>Master</summary>
          <ul id="master-list" aria-label="Master subtabs">${links}</ul>
        </details>
      </nav>
    </aside>`;
}
