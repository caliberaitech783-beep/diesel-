import { pulseMaster, pulseMasters } from './pulse-master-catalog.mjs';

const keyOf = (master, record) => String(record[master.columns[0][0]] ?? '').trim().toLowerCase();

export function createPulseMasterStore(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS pulse_master_copies (
    master TEXT PRIMARY KEY, records TEXT NOT NULL, synced_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS pulse_master_additions (
      id INTEGER PRIMARY KEY, master TEXT NOT NULL, record TEXT NOT NULL, added_by TEXT NOT NULL, added_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS pulse_master_seeds (name TEXT PRIMARY KEY)`);
  const read = db.prepare('SELECT records, synced_at FROM pulse_master_copies WHERE master=?');
  const save = db.prepare(`INSERT INTO pulse_master_copies(master,records,synced_at) VALUES(?,?,?)
    ON CONFLICT(master) DO UPDATE SET records=excluded.records, synced_at=excluded.synced_at`);
  const added = slug => db.prepare('SELECT id, record, added_by FROM pulse_master_additions WHERE master=? ORDER BY id').all(slug)
    .map(row => ({ ...JSON.parse(row.record), addedInDiesel: row.id, addedBy: row.added_by }));
  // Records added in Diesel, by hand or from a file, sit beside the Pulse copy and survive every fetch.
  // One that Pulse later sends under the same first column gives way to the Pulse record.
  function add(slug, records, by, at) {
    const master = pulseMaster(slug);
    const copy = read.get(slug);
    const taken = new Set([...(copy ? JSON.parse(copy.records) : []), ...added(slug)].map(record => keyOf(master, record)));
    const insert = db.prepare('INSERT INTO pulse_master_additions(master,record,added_by,added_at) VALUES(?,?,?,?)');
    const outcome = { added: 0, skipped: 0 };
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const record of records) {
        const key = keyOf(master, record);
        if (!key || taken.has(key)) { outcome.skipped += 1; continue; }
        taken.add(key);
        insert.run(slug, JSON.stringify(Object.fromEntries(master.columns.map(([column]) => [column, record[column] ?? '']))), by, at);
        outcome.added += 1;
      }
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    return outcome;
  }
  return {
    replace(copy, syncedAt) {
      db.exec('BEGIN IMMEDIATE');
      try {
        for (const { slug } of pulseMasters) save.run(slug, JSON.stringify(copy[slug] ?? []), syncedAt);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    read(slug) {
      const row = read.get(slug), master = pulseMaster(slug);
      const records = row ? JSON.parse(row.records) : [];
      const fromPulse = new Set(master ? records.map(record => keyOf(master, record)) : []);
      const extra = master ? added(slug).filter(record => !fromPulse.has(keyOf(master, record))) : [];
      return { records: [...records, ...extra], syncedAt: row?.synced_at ?? null };
    },
    add,
    remove: (slug, id) => db.prepare('DELETE FROM pulse_master_additions WHERE master=? AND id=?').run(slug, id).changes > 0,
    // Records Diesel starts with are added once; removing one later keeps it removed.
    seed(name, slug, records, at) {
      if (db.prepare('SELECT 1 FROM pulse_master_seeds WHERE name=?').get(name)) return;
      add(slug, records, 'Diesel', at);
      db.prepare('INSERT INTO pulse_master_seeds(name) VALUES(?)').run(name);
    },
  };
}
