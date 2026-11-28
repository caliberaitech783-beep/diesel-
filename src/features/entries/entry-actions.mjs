import { esc } from './entry-shell.mjs';
import { mayStartEntry, newEntryPath } from './entry-creation.mjs';

export function newEntryLink(actor, module, className = 'primary') {
  if (!mayStartEntry(actor,module)) return `<form class="entry-new-action" method="post" action="/entries/start/${module.id}"><button class="${className}" title="Start a new ${esc(module.name)}">New entry</button></form>`;
  return `<a class="${className}" href="${newEntryPath(actor, module)}" title="Start a new ${esc(module.name)}">New entry</a>`;
}

export function indentActionMenu(actor, module) {
  return `<details class="entry-action-menu"><summary>Options</summary><nav aria-label="Diesel indent options">${newEntryLink(actor, module, 'entry-action-link')}<a href="/indent-approvals">Approval</a></nav></details>`;
}

export function indentEntryActions(actor, module) {
  return `<div class="entry-actions">${newEntryLink(actor, module)}${indentActionMenu(actor, module)}</div>`;
}
