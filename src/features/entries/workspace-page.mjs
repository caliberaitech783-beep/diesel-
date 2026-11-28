// Diesel Workspace: every entry as a card under its category heading, in the order the work is done.
// Each card shows the entry's record count and anything waiting, opens its register, and can start a new entry.
import { esc, page } from './entry-shell.mjs';
import { entryRole } from './review-masters.mjs';
import { icons, workspaceFor } from './workspace-map.mjs';

const plural = (count, word) => count + ' ' + word + (count === 1 ? '' : 's');

export function workspacePage(actor, rows) {
  const list = workspaceFor(actor), saved = rows.filter(row => row.rev > 0), role = entryRole(actor);
  const count = (type, test = () => true) => saved.filter(row => row.type === type && test(row)).length;
  // The same rule as the register's "New entry" button: the entry's maker role starts it.
  const mayStart = module => module.maker && (module.maker === role || module.id === 'E16' || (module.id === 'E15' && role === 'Site Store'));
  const card = module => {
    const waiting = count(module.id, row => row.status === 'Awaiting approval'), returned = count(module.id, row => row.status === 'Returned');
    return `<div class="ws-card" data-name="${esc(module.name.toLowerCase() + ' ' + module.about.toLowerCase())}"><a class="ws-card-open" href="/entries/type/${module.id}">
        <span class="ws-icon">${icons.module}</span><span class="ws-text"><b>${esc(module.name)}</b><small>${plural(count(module.id), 'record')}</small>
        ${waiting ? `<em class="ws-badge">${waiting} awaiting approval</em>` : ''}${returned ? `<em class="ws-badge returned">${returned} returned</em>` : ''}</span>
        <span class="ws-arrow">${icons.arrow}</span></a>
      ${mayStart(module) ? `<a class="ws-new" href="/entries/new/${module.id}" title="Start a new ${esc(module.name)}">+ New</a>` : ''}</div>`;
  };
  const total = list.reduce((sum, category) => sum + category.modules.length, 0);
  const body = list.length ? `<div class="master-cards-head"><p class="record-meta">${total} entries · everything the department records, in the order the work is done</p>
      <label class="master-filter"><span class="sr-only">Filter entries</span><input type="search" id="workspace-filter" placeholder="Filter entries…" autocomplete="off" hidden></label></div>
    ${list.map(category => `<section class="ws-group cat-${category.id}"><h2><span class="ws-icon small">${icons[category.icon]}</span>${esc(category.name)}<small>${esc(category.about)}</small></h2>
      <div class="ws-cards">${category.modules.map(card).join('')}</div></section>`).join('')}
    <p class="master-cards-none" id="workspace-none" hidden>No entry matches that filter.</p>`
    : '<p class="empty">No entry is open to your role at this site.</p>';
  const heading = `<div class="ws-heading"><h1>Workspace</h1><p>${esc(actor.selectedSite===''?'All accessible sites':actor.site)}</p></div>`;
  return page('Workspace', actor, 'workspace', '/entries/workspace', body, heading);
}
