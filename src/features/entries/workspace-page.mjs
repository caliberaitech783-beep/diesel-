// Diesel Workspace: the categories on the left, the chosen category's modules on the right.
import { esc, page } from './entry-shell.mjs';
import { icons, workspaceFor } from './workspace-map.mjs';

const plural = (count, word) => count + ' ' + word + (count === 1 ? '' : 's');

export function workspacePage(actor, rows, query = {}) {
  const list = workspaceFor(actor);
  const chosen = list.find(category => category.id === query.category) ?? list[0];
  const count = type => rows.filter(row => row.type === type && row.rev > 0).length;
  const left = list.map(category => `<a class="ws-category cat-${category.id}" href="/entries/workspace?category=${category.id}"${category === chosen ? ' aria-current="true"' : ''}>
    <span class="ws-icon">${icons[category.icon]}</span><span class="ws-text"><b>${esc(category.name)}</b><small>${plural(category.modules.length, 'module')}</small></span>
    <span class="ws-arrow">${icons.arrow}</span></a>`).join('');
  const right = chosen ? `<section class="ws-panel cat-${chosen.id}" aria-label="${esc(chosen.name)} modules">
    <header><span class="ws-icon large">${icons[chosen.icon]}</span><div><h2>${esc(chosen.name)}</h2><p>${esc(chosen.about)}</p></div></header>
    <div class="ws-modules">${chosen.modules.map(module => `<a class="ws-module" href="/entries/type/${module.id}">
      <span class="ws-icon small">${icons.module}</span><span class="ws-text"><b>${esc(module.name)}</b><small>${esc(module.about)}</small>
      <em>${plural(count(module.id), 'record')}</em></span><span class="ws-arrow">${icons.arrow}</span></a>`).join('')}</div></section>`
    : '<p class="empty">No entry is open to your role at this site.</p>';
  const heading = `<div class="ws-heading"><h1>Diesel Workspace</h1><p>Select a category to see its modules · ${esc(actor.site)}</p></div>`;
  return page('Diesel Workspace', actor, 'workspace', '/entries/workspace', `<div class="ws-split"><nav class="ws-categories" aria-label="Workspace categories">${left}</nav>${right}</div>`, heading);
}
