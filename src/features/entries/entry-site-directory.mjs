import { entrySites } from './entry-sites.mjs';

export function readEntrySiteDirectory(db,locations=[]) {
  const hasCopy=db?.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='pulse_master_copies'").get();
  const copy=hasCopy ? JSON.parse(db.prepare("SELECT records FROM pulse_master_copies WHERE master='site'").get()?.records??'[]') : [];
  // Locations added in Diesel's Location Master, such as the CMPL offices, can raise indents too.
  const hasAdded=db?.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='pulse_master_additions'").get();
  const added=hasAdded ? db.prepare("SELECT record FROM pulse_master_additions WHERE master='site' ORDER BY id").all().map(row=>JSON.parse(row.record)) : [];
  return [...entrySites,...[...copy,...added].filter(row=>row.name).map(row=>({site:row.name,name:row.name})),
    ...locations.map(row=>({site:row.site,name:row.pulseName??row.site}))];
}
