import { esc } from './entry-shell.mjs';
import { newEntryLink } from './entry-actions.mjs';
import { icons, workspaceFor } from './workspace-map.mjs';

export function entryModuleCards(actor,{newEntries=true}={}) {
  const list=workspaceFor(actor);
  const card=module=>`<div class="ws-card" data-name="${esc(module.name.toLowerCase()+' '+module.about.toLowerCase())}"><a class="ws-card-open" href="/entries/type/${module.id}">
    <span class="ws-icon">${icons.module}</span><span class="ws-text"><b>${esc(module.name)}</b></span></a>
    ${newEntries?`<div class="ws-card-actions">${newEntryLink(actor,module,'ws-new')}</div>`:''}</div>`;
  return list.length?`<div class="master-cards-head"><label class="master-filter"><span class="sr-only">Filter entries</span><input type="search" id="workspace-filter" placeholder="Filter entries…" autocomplete="off" hidden></label></div>
    ${list.map(category=>`<section class="ws-group cat-${category.id}"><h2><span class="ws-icon small">${icons[category.icon]}</span>${esc(category.name)}</h2>
      <div class="ws-cards">${category.modules.map(card).join('')}</div></section>`).join('')}
    <p class="master-cards-none" id="workspace-none" hidden>No entry matches that filter.</p>`
    :'<p class="empty">No entry is open to your role at this site.</p>';
}
