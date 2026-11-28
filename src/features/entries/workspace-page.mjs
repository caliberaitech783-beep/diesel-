// Diesel Workspace: every entry as a card under its category heading, in the order the work is done.
// Each card names the module, opens its register, and can start a new entry.
import { esc, page } from './entry-shell.mjs';
import { newEntryLink, indentActionMenu } from './entry-actions.mjs';
import { icons, workspaceFor } from './workspace-map.mjs';

export function workspacePage(actor) {
  const list = workspaceFor(actor);
  const card = module => {
    return `<div class="ws-card" data-name="${esc(module.name.toLowerCase() + ' ' + module.about.toLowerCase())}"><a class="ws-card-open" href="/entries/type/${module.id}">
        <span class="ws-icon">${icons.module}</span><span class="ws-text"><b>${esc(module.name)}</b></span>
        <span class="ws-arrow">${icons.arrow}</span></a>
      <div class="ws-card-actions">${newEntryLink(actor, module, 'ws-new')}${module.id === 'E1' ? indentActionMenu(actor, module) : ''}</div></div>`;
  };
  const body = list.length ? `<div class="master-cards-head">
      <label class="master-filter"><span class="sr-only">Filter entries</span><input type="search" id="workspace-filter" placeholder="Filter entries…" autocomplete="off" hidden></label></div>
    ${list.map(category => `<section class="ws-group cat-${category.id}"><h2><span class="ws-icon small">${icons[category.icon]}</span>${esc(category.name)}</h2>
      <div class="ws-cards">${category.modules.map(card).join('')}</div></section>`).join('')}
    <p class="master-cards-none" id="workspace-none" hidden>No entry matches that filter.</p>`
    : '<p class="empty">No entry is open to your role at this site.</p>';
  const heading = '<div class="ws-heading"><h1>Workspace</h1></div>';
  return page('Workspace', actor, 'workspace', '/entries/workspace', body, heading);
}
