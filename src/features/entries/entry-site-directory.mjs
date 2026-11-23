import { entrySites } from './entry-sites.mjs';

export function readEntrySiteDirectory(db,locations=[]) {
  const hasCopy=db?.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='pulse_master_copies'").get();
  const copy=hasCopy ? JSON.parse(db.prepare("SELECT records FROM pulse_master_copies WHERE master='site'").get()?.records??'[]') : [];
  return [...entrySites,...copy.map(row=>({site:row.name,name:row.name})),
    ...locations.map(row=>({site:row.site,name:row.pulseName??row.site}))];
}
