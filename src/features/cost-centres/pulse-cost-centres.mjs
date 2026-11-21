import { costCentreRecords } from './cost-centre-records.mjs';
import { pulseMaster } from '../pulse-masters/pulse-master-catalog.mjs';
import { forSite } from '../pulse-masters/pulse-master-rules.mjs';

// Reuse Pulse's validated, site-filtered copy and its automatic refresh/cache policy.
export function createPulseCostCentres({ getAccess, readEquipment }) {
  return async ({ request, access, sites } = {}) => {
    const allowed = access ?? (request && await getAccess(request));
    if (!allowed) return [];
    const copy = await readEquipment(allowed);
    return costCentreRecords({ ...copy, records: sites ? forSite(pulseMaster('equipment'), copy.records, sites) : copy.records });
  };
}
