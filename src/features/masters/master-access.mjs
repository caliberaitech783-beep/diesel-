const roles = new Set(['maker', 'checker', 'viewer']);
const clean = (value, limit) => typeof value === 'string' && value.trim().length <= limit
  && !/[\x00-\x1f\x7f]/.test(value) ? value.trim().normalize('NFKC') : '';
const siteKey = site => clean(site, 120).toLowerCase();

export function masterAssignments(profile) {
  if (!clean(profile?.login, 200) || !Array.isArray(profile.dieselMasterAccess)) return [];
  const sites = new Map();
  for (const assignment of profile.dieselMasterAccess) {
    const site = clean(assignment?.site, 120);
    const role = clean(assignment?.role, 40).toLowerCase().replace(/^master /, '');
    if (!site || !roles.has(role)) continue;
    const key = siteKey(site);
    const grant = sites.get(key) ?? { site, key, canEditMasters: false, canApproveMasters: false };
    grant.canEditMasters ||= role === 'maker';
    grant.canApproveMasters ||= role === 'checker';
    const name = clean(assignment.projectName, 200), client = clean(assignment.client, 200);
    if (name && client && grant.project === undefined) grant.project = { name, client };
    else if (name && client && (grant.project?.name !== name || grant.project?.client !== client)) grant.project = null;
    sites.set(key, grant);
  }
  return [...sites.values()];
}

export function assignedMasterActor(profile, selectedSite) {
  const masterSites = masterAssignments(profile);
  const grant = masterSites.find(item => item.key === siteKey(selectedSite)) ?? masterSites[0];
  if (!grant) return null;
  return { ...grant, id: profile.login.trim().toLowerCase(), name: profile.name || profile.login, masterSites };
}
