import { esc, option, page } from './entry-shell.mjs';
import { entryCreationSites, newEntryPath } from './entry-creation.mjs';
import { roleKey } from './review-masters.mjs';

export function newEntryLink(actor, module, className = 'primary') {
  return `<a class="${className}" href="${newEntryPath(actor, module)}" title="Start a new ${esc(module.name)}">New entry</a>`;
}

export function indentActionMenu(actor, module) {
  return `<details class="entry-action-menu"><summary>Options</summary><nav aria-label="Diesel indent options">${newEntryLink(actor, module, 'entry-action-link')}<a href="/indent-approvals">Approval</a></nav></details>`;
}

export function indentEntryActions(actor, module) {
  return `<div class="entry-actions">${newEntryLink(actor, module)}${indentActionMenu(actor, module)}</div>`;
}

export function entryStartPage(actor, module) {
  const sites = entryCreationSites(actor, module);
  const body = sites.length ? `<p>Choose a site to start a new ${esc(module.name.toLowerCase())}.</p>
    <form method="post" action="/workspace/role" class="entry-start-form">
      <input type="hidden" name="role" value="${roleKey(module.maker)}">
      <input type="hidden" name="returnTo" value="/entries/new/${module.id}">
      ${module.id === 'E1' ? '<input type="hidden" name="indentSite" value="1">' : ''}
      <label>Site <select name="site" required>${option('', 'Select a site', !sites.some(row => row.site === actor.selectedSite))}${sites.map(row => option(row.site, row.name, row.site === actor.selectedSite)).join('')}</select></label>
      <button class="primary">New entry</button>
    </form>` : '<p>Your account has no maker assignment for this module. Ask your administrator to grant the required access.</p>';
  return page('New entry · ' + module.name, actor, module.id, '/entries/start/' + module.id,
    `${body}<p><a href="/entries/workspace">← Workspace</a></p>`);
}
