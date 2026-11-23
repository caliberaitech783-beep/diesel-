import { canonicalSite } from '../pulse-masters/site-names.mjs';

// Pulse's operational directory, also available when the local preview has no live copy.
export const entrySites = [
  { site:'Jayant', name:'Jayant OC' }, { site:'Sasti', name:'Sasti OC' },
  ...['Majri OC','Dhoptala OC (2nd)','Gauri Pauni OC (2nd)','Lalpeth OC','Dudhichua OC','Dudhichua East OC']
    .map(name=>({site:name,name})),
];

export function entrySiteDirectory(actor) {
  const rows = [...(actor.entrySites ?? entrySites), {site:actor.site,name:actor.site},
    ...(actor.assignments ?? []).map(grant=>({site:grant.site,name:grant.site}))];
  const directory = new Map();
  for (const row of rows) {
    const key=canonicalSite(row.name);
    if (!key) continue;
    const grant=actor.assignments?.find(grant=>canonicalSite(grant.site)===key && grant.profile===actor.profile);
    const current=canonicalSite(actor.site)===key;
    if (!directory.has(key)) directory.set(key,{...row,site:current?actor.site:grant?.site??row.site,
      allowed:!actor.assignments||Boolean(grant)||current});
  }
  return [...directory.values()];
}

export function siteInitials(site) {
  const name=entrySites.find(row=>canonicalSite(row.name)===canonicalSite(site))?.name ?? site;
  return String(name).normalize('NFKC').match(/[\p{L}\p{N}]+/gu)?.map(word=>/^\d/.test(word)?word.match(/^\d+/)[0]:/^[A-Z]{2,3}$/.test(word)?word:word[0]).join('').toUpperCase() ?? '';
}
