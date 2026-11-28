import { esc } from './entry-shell.mjs';

const approvalPaths = { E1:'/indent-approvals', E2:'/po-approvals', E3:'/entries/approvals?type=E3' };

// Entry opens the module's register; New entry remains its direct form action.
// Approval opens the existing protected inbox, without changing decision rights.
export function workspaceModuleMenu(module, label) {
  const approvalPath=approvalPaths[module.id];
  if (!approvalPath) return `<a class="ws-card-open" href="/entries/type/${module.id}">${label}</a>`;
  return `<details class="ws-module-menu" name="workspace-module"><summary class="ws-card-open">${label}<svg class="ws-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></summary>
    <nav aria-label="${esc(module.name)} actions"><a href="/entries/type/${module.id}">Entry</a><a href="${approvalPath}">Approval</a></nav></details>`;
}
