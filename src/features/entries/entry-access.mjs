import { roles, roleKey, sites } from './review-masters.mjs';

const pilotRoles = ['Site In-charge', 'Project Manager', 'Procurement Executive', 'Head – Procurement', 'Director / CMD', 'CFO'];
const normalize = value => typeof value === 'string'
  ? value.trim().normalize('NFKC').toLowerCase().replace(/[‐‑–—]/g, '-').replace(/\s+/g, ' ')
  : '';
const roleNames = new Map(pilotRoles.map(role => [normalize(role), role]));
roleNames.set('head of procurement', 'Head – Procurement');
const siteNames = new Map(sites.flatMap(site => [[normalize(site), site], [normalize(site + ' OC'), site]]));

export const pilotEntry = type => type === 'E1' || type === 'E2';

// Each grant binds one role to one site. Only the verified Pulse response supplies grants.
export function entryAssignments(profile, siteStock = false) {
  if (typeof profile?.login !== 'string' || !profile.login.trim() || !Array.isArray(profile.dieselEntryAccess)) return [];
  const assignments = new Map();
  for (const grant of profile.dieselEntryAccess) {
    const site = siteNames.get(normalize(grant?.site));
    const role = roleNames.get(normalize(grant?.role)) ?? (siteStock
      ? (normalize(grant?.role)==='head of accounts' ? 'Head – Accounts' : roles.find(name=>normalize(name)===normalize(grant?.role))) : undefined);
    if (!site || !role) continue;
    const key = site + '.' + roleKey(role);
    assignments.set(key, { site, role, profile: roleKey(role), key });
  }
  return [...assignments.values()];
}

export function assignedEntryActor(profile, assignments, selection) {
  const grant = assignments.find(item => item.key === selection) ?? assignments[0];
  if (!grant) return null;
  const id = profile.login.trim().toLowerCase();
  return {
    id, site: grant.site, profile: grant.profile, hosted: true, assignments, canOpenMasters: profile.dieselMastersAllowed,
    actionContext: JSON.stringify([id, grant.key]),
  };
}

export function canChooseRole(actor, site, profile) {
  if (actor.assignments) return actor.assignments.some(grant => grant.site === site && grant.profile === profile);
  return sites.includes(site) && (profile === 'entry-deputy' || roles.some(role => roleKey(role) === profile));
}
