import { MasterRecordError } from './records-fields.mjs';

// The operational project names in Pulse's WCL/NCL region directory.
export const itemSiteGroups = [
  { name: 'WCL', sites: ['Sasti OC', 'Majri OC', 'Dhoptala OC (2nd)', 'Gauri Pauni OC (2nd)', 'Lalpeth OC'] },
  { name: 'NCL', sites: ['Jayant OC', 'Dudhichua OC', 'Dudhichua East OC'] },
];
const sites = itemSiteGroups.flatMap(group => group.sites);

export function itemSubmissionSite(value, previous = '') {
  // Older API clients and saved records remain readable; the new form requires a choice.
  if (value === undefined) return previous;
  if (typeof value !== 'string' || !sites.includes(value)) throw new MasterRecordError('Choose a listed WCL or NCL site.');
  return value;
}
