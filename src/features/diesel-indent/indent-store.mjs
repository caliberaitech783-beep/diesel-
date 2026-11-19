import { readActiveMasters } from '../masters/records.mjs';

export function indentContext(db, site) {
  const masters = readActiveMasters(db, site, ['location-master', 'item-master', 'storage-location-master']);
  const location = masters['location-master'].find(record => record.site === site);
  const item = masters['item-master'].find(record => record.code === '19726');
  const tanks = masters['storage-location-master'].filter(record => location && record.site === site
    && record.values.Location === location.code && record.values['Storage type'] === 'UG tank');
  return { location, item, safeFill: tanks.length ? tanks.reduce((sum, tank) => sum + Number(tank.values['Safe fill level (L)']), 0) : null };
}

export function createIndentStore(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS diesel_indent_drafts (
    id TEXT PRIMARY KEY, site TEXT NOT NULL, quantity TEXT NOT NULL, requiredBy TEXT NOT NULL,
    remarks TEXT NOT NULL, revision INTEGER NOT NULL, updatedBy TEXT NOT NULL, updatedAt TEXT NOT NULL
  )`);
  const list = db.prepare('SELECT * FROM diesel_indent_drafts WHERE site=? ORDER BY updatedAt DESC');
  const get = db.prepare('SELECT * FROM diesel_indent_drafts WHERE site=? AND id=?');
  const insert = db.prepare('INSERT INTO diesel_indent_drafts VALUES (?,?,?,?,?,1,?,?) ON CONFLICT(id) DO NOTHING');
  const update = db.prepare('UPDATE diesel_indent_drafts SET quantity=?,requiredBy=?,remarks=?,updatedBy=?,updatedAt=?,revision=revision+1 WHERE site=? AND id=? AND revision=?');
  return {
    list: site => list.all(site),
    get: (site, id) => get.get(site, id),
    save(id, revision, actor, { quantity, requiredBy, remarks }) {
      const now = new Date().toISOString();
      const result = revision === 0
        ? insert.run(id, actor.site, quantity, requiredBy, remarks, actor.id, now)
        : update.run(quantity, requiredBy, remarks, actor.id, now, actor.site, id, revision);
      return result.changes === 1;
    },
  };
}
