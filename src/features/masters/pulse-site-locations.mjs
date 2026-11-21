import { createMasterStore } from './records.mjs';
import { pulseProject } from './pulse-projects.mjs';

// Pulse owns the site and its region. A site's Location Master record starts from them, so Entry does not wait for retyping.
const creator = { id: 'pulse-site-master', name: 'Pulse Location Master' };
const approver = { id: 'pulse-site-master-approval', name: 'Pulse Location Master (automatic)' };
const letters = value => String(value ?? '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const stores = new WeakMap();

// "Sasti" in a role assignment is Pulse's site "Sasti OC".
export function pulseSiteFor(site, siteRecords) {
  const key = letters(site);
  const found = key ? (siteRecords ?? []).filter(record => [key, key + 'oc'].includes(letters(record.name))) : [];
  return found.length === 1 && found[0].region ? found[0] : null;
}

export const locationCode = name => String(name).normalize('NFKC').toUpperCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 30);

// grants: [{ site, project?: { name, client } }] from a verified Pulse profile.
// Returns the sites that gained a record and the sites Pulse's Location Master could not identify yet.
export function createLocationsFromPulseSites(db, grants, siteRecords) {
  const created = [], missing = [];
  for (const grant of grants) {
    const site = typeof grant?.site === 'string' ? grant.site.trim().normalize('NFKC') : '';
    if (!site || site.length > 120) continue;
    if (db.prepare("SELECT 1 FROM master_records WHERE master='location-master' AND site_key=?").get(site.toLowerCase())) continue;
    const pulseSite = pulseSiteFor(site, siteRecords);
    const project = grant.project ?? pulseProject(db, site) ?? (pulseSite && { name: pulseSite.name, client: pulseSite.region });
    if (!project?.name || !project.client || !locationCode(project.name)) { missing.push(site); continue; }
    let store = stores.get(db);
    if (!store) stores.set(db, store = createMasterStore(db, ['location-master']));
    // Keeps the Pulse name and client with the site, so its makers can edit the record later.
    db.prepare('INSERT INTO pulse_projects(site,name,client) VALUES(?,?,?) ON CONFLICT(site) DO NOTHING').run(site, project.name, project.client);
    const details = pulseSite ?? pulseSiteFor(project.name, siteRecords);
    const record = store.create('location-master', { site, values: {
      'Location Code': locationCode(project.name), ...(site !== project.name ? { 'Short Name': site } : {}),
      'Business day cut-off': '06:00', 'Site In-charge': 'As assigned in Pulse', 'Project Manager': 'As assigned in Pulse',
      'Receipt scenario allowed': 'Both',
      'Location details / Remark': 'Created from the Pulse Location Master' + (details?.regionCode ? ' · region ' + details.regionCode : '') + '. Review the cut-off and receipt scenario.',
    }, attributes: details?.state ? [{ name: 'State', value: details.state, reference: 'Pulse Location Master' }] : undefined },
    { ...creator, site, project });
    store.changeStatus('location-master', record.id, record.revision, 'approve', approver);
    created.push(site);
  }
  return { created, missing };
}
