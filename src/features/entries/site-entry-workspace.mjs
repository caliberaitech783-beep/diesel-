import { approvedLocationDirectory, readActiveMasters } from '../masters/records.mjs';
import { entryPolicy, policyMasters } from './entry-policy.mjs';
import { readSiteMasters } from './site-masters.mjs';
import { createOpeningStockStore } from './opening-stock.mjs';
import { entryCalendar } from './entry-calendar.mjs';

export function approvedPolicyReader(masterDb) {
  return (site, day) => entryPolicy(readActiveMasters(masterDb,site,policyMasters),site,day);
}

export function siteEntryWorkspace(siteDb, masterDb) {
  const mastersFor = site => readSiteMasters(masterDb,site);
  const calendarFor = site => {
    const data = readActiveMasters(masterDb,site,['shift-master','location-master']);
    return entryCalendar(data['shift-master'],data['location-master'].find(location=>location.site===site));
  };
  const opening = createOpeningStockStore(siteDb,mastersFor);
  return { opening, mastersFor, calendarFor, policyFor:approvedPolicyReader(masterDb), siteFor(site) {
    const record = opening.get(site);
    if (record?.status !== 'approved') return null;
    const { items: _items, storage: _storage, ...masters } = mastersFor(site);
    const authorized = new Set(approvedLocationDirectory(masterDb).map(({site})=>site));
    const destinations = opening.approved().filter(next => next.site !== site && authorized.has(next.site))
      .map(({ site, item, storage, businessDay }) => ({ site, item, storage, businessDay }));
    return { ...record, ...masters, destinations };
  } };
}
