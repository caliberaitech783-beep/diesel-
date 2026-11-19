import { readActiveMasters } from '../masters/records.mjs';
import { entryPolicy, policyMasters } from './entry-policy.mjs';
import { readSiteMasters } from './site-masters.mjs';
import { createOpeningStockStore } from './opening-stock.mjs';
import { otherSite } from './review-masters.mjs';

export function approvedPolicyReader(masterDb) {
  return (site, day) => entryPolicy(readActiveMasters(masterDb,site,policyMasters),site,day);
}

export function siteEntryWorkspace(siteDb, masterDb) {
  const mastersFor = site => readSiteMasters(masterDb,site);
  const opening = createOpeningStockStore(siteDb,mastersFor);
  return { opening, mastersFor, policyFor:approvedPolicyReader(masterDb), siteFor(site) {
    const record = opening.get(site);
    if (record?.status !== 'approved') return null;
    const { items: _items, storage: _storage, ...masters } = mastersFor(site);
    const peer = otherSite(site);
    const next = peer ? opening.get(peer) : null;
    const destination = next?.status==='approved' ? { site:peer, item:next.item, storage:next.storage, businessDay:next.businessDay } : null;
    return { ...record, ...masters, destination };
  } };
}
