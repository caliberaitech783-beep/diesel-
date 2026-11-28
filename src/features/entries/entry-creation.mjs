import { canChooseRole } from './entry-access.mjs';
import { entryRole, roleKey } from './review-masters.mjs';

export function mayStartEntry(actor, module) {
  const role = entryRole(actor);
  return Boolean(module?.maker && (module.maker === role || module.id === 'E16'
    || (module.id === 'E15' && role === 'Site Store')));
}

// A different module may need another verified assignment. Never infer a grant
// from the presence of its card in the workspace.
export const newEntryPath = (actor, module) => '/entries/' + (mayStartEntry(actor, module) ? 'new/' : 'start/') + module.id;

export function entryCreationContext(actor, module) {
  if (mayStartEntry(actor,module)) return {site:actor.site,role:actor.profile};
  if (actor.assignments) {
    const grants=actor.assignments.filter(grant=>mayStartEntry({...actor,profile:grant.profile},module));
    const grant=grants.find(grant=>grant.site===actor.site)??grants[0];
    return grant ? {site:grant.site,role:grant.profile} : null;
  }
  const role=roleKey(module.maker);
  return canChooseRole(actor,actor.site,role) ? {site:actor.site,role} : null;
}
