import { entryRole, roleKey } from './review-masters.mjs';
import { entrySiteDirectory } from './entry-sites.mjs';

export const siteContextCookies = secure => ['diesel_stock_assignment','diesel_entry_assignment','diesel_review_context']
  .map(name=>(secure?'__Host-':'')+name);

// Choosing a site keeps the current post where possible. Every alternative
// still comes from that person's verified assignments, never the form.
export function siteContextChoice(actor,input={}) {
  const assignment=actor.assignments?.find(grant=>grant.key===input.assignment);
  if(assignment)return {site:assignment.site,role:assignment.profile};
  if(input.siteOnly!=='1')return {site:input.site,role:input.role};
  const grant=actor.assignments?.find(grant=>grant.site===input.site&&grant.profile===actor.profile)
    ?? actor.assignments?.find(grant=>grant.site===input.site);
  return {site:input.site,role:grant?.profile??(actor.profile==='entry-deputy'?actor.profile:roleKey(entryRole(actor)))};
}

export function siteContextOptions(actor) {
  const granted=actor.assignments&&new Set(actor.assignments.map(grant=>grant.site));
  return entrySiteDirectory(actor).filter(row=>granted?granted.has(row.site):row.allowed!==false);
}
