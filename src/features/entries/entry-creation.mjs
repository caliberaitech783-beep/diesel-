import { canChooseRole } from './entry-access.mjs';
import { entrySiteDirectory } from './entry-sites.mjs';
import { entryRole, roleKey } from './review-masters.mjs';

export function mayStartEntry(actor, module) {
  const role = entryRole(actor);
  return Boolean(module?.maker && (module.maker === role || module.id === 'E16'
    || (module.id === 'E15' && role === 'Site Store')));
}

// A different module may need another verified assignment. Never infer a grant
// from the presence of its card in the workspace.
export function entryCreationSites(actor, module) {
  const profile = roleKey(module.maker);
  const sites = actor.assignments
    ? actor.assignments.filter(grant => grant.profile === profile).map(grant => ({ site: grant.site, name: grant.site }))
    : entrySiteDirectory(actor);
  return [...new Map(sites.filter(row => canChooseRole(actor, row.site, profile)).map(row => [row.site, row])).values()];
}

export const newEntryPath = (actor, module) => '/entries/' + (mayStartEntry(actor, module) ? 'new/' : 'start/') + module.id;
