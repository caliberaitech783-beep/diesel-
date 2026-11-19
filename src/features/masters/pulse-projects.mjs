// Preserve the keys of Location records created with the original sample directory.
const legacySiteKeys = new Map([['jayant oc', 'Jayant'], ['sasti oc', 'Sasti']]);

export function preparePulseProjects(db) {
  db.exec('CREATE TABLE IF NOT EXISTS pulse_projects (site TEXT PRIMARY KEY, name TEXT NOT NULL, client TEXT NOT NULL)');
}

export function syncPulseProjects(db, regions) {
  const byScope = new Map();
  for (const region of regions) for (const raw of region.sites) {
    const name = raw.trim().normalize('NFKC'), nameKey = name.toLowerCase();
    if (!name || name.length > 120) continue;
    const site = legacySiteKeys.get(nameKey) ?? name;
    const key = site.toLowerCase();
    // Names shared by several clients need an explicit source mapping.
    byScope.set(key, byScope.has(key) ? null : {
      site, name, client: region.name?.trim(),
    });
  }
  const projects = [...byScope.values()].filter(project => project?.client);
  preparePulseProjects(db);
  db.exec('BEGIN IMMEDIATE');
  try {
    const upsert = db.prepare('INSERT INTO pulse_projects(site,name,client) VALUES(?,?,?) ON CONFLICT(site) DO UPDATE SET name=excluded.name,client=excluded.client');
    for (const project of projects) upsert.run(project.site, project.name, project.client);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return projects;
}

export function pulseProject(db, site) {
  return db.prepare('SELECT name,client FROM pulse_projects WHERE site=?').get(site);
}
