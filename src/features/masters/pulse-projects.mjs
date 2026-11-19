// These scopes also identify existing local Item Master records and review roles.
const pilotNames = { Jayant: 'Jayant OC', Sasti: 'Sasti OC' };

export function preparePulseProjects(db) {
  db.exec('CREATE TABLE IF NOT EXISTS pulse_projects (site TEXT PRIMARY KEY, name TEXT NOT NULL, client TEXT NOT NULL)');
}

export function syncPulseProjects(db, regions) {
  const projects = Object.entries(pilotNames).map(([site, name]) => {
    const matches = regions.filter(region => region.sites.includes(name));
    if (matches.length !== 1 || !matches[0].name?.trim()) throw new Error('Check the Pulse 1 project mapping for ' + site);
    return { site, name, client: matches[0].name.trim() };
  });
  const pilot = new Set(Object.values(pilotNames).map(name => name.toLowerCase()));
  const additional = new Map();
  for (const region of regions) for (const name of region.sites) {
    const site = name.trim().normalize('NFKC'), key = site.toLowerCase();
    if (!site || site.length > 120 || pilot.has(key) || Object.keys(pilotNames).some(label => label.toLowerCase() === key)) continue;
    // Names shared by several clients need an explicit source mapping.
    additional.set(key, additional.has(key) ? null : {
      site, name: site, client: region.name?.trim(),
    });
  }
  projects.push(...[...additional.values()].filter(project => project?.client));
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
