// Locations are the regional offices that buy diesel; sites are the mines that ask for it. Each site sits under one location.
// An indent is raised and numbered by site. A purchase order belongs to, and is numbered by, the site's location.
import { canonicalSite } from '../pulse-masters/site-names.mjs';
import { entrySites } from './entry-sites.mjs';

export const locations = [
  { name: 'CMPL Chandrapur', code: 'CCH', sites: [] },
  { name: 'CMPL Madhya Pradesh', code: 'CMP', sites: ['Jayant OC', 'Dudhichua OC', 'Dudhichua East OC'] },
  { name: 'CMPL Nagpur', code: 'CNG', sites: ['Sasti OC', 'Majri OC', 'Dhoptala OC (2nd)', 'Gauri Pauni OC (2nd)', 'Lalpeth OC'] },
];

const key = site => canonicalSite(entrySites.find(row => row.site === site)?.name ?? site);
const bySite = new Map(locations.flatMap(location => [location.name, ...location.sites].map(site => [canonicalSite(site), location])));

// The location a site belongs to. An office is its own location. Undefined for a site not yet placed under one.
export const locationOf = site => bySite.get(key(site));
export const locationName = site => locationOf(site)?.name ?? '';
