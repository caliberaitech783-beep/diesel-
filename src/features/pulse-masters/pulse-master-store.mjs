import { pulseMasters } from './pulse-master-catalog.mjs';

export function createPulseMasterStore(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS pulse_master_copies (
    master TEXT PRIMARY KEY, records TEXT NOT NULL, synced_at TEXT NOT NULL)`);
  const read = db.prepare('SELECT records, synced_at FROM pulse_master_copies WHERE master=?');
  const save = db.prepare(`INSERT INTO pulse_master_copies(master,records,synced_at) VALUES(?,?,?)
    ON CONFLICT(master) DO UPDATE SET records=excluded.records, synced_at=excluded.synced_at`);
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
      const row = read.get(slug);
      return row ? { records: JSON.parse(row.records), syncedAt: row.synced_at } : { records: [], syncedAt: null };
    },
  };
}
