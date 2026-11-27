// What people have decided about the data checks, and how the count has moved over time.
// - A finding marked "not a problem" stops counting until someone brings it back.
// - One total is kept for each day the checks are opened, so the page can say whether the data is getting cleaner.
export function createCheckNotes(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS data_check_accepted (check_title TEXT NOT NULL, item TEXT NOT NULL, accepted_by TEXT NOT NULL, accepted_at TEXT NOT NULL, PRIMARY KEY (check_title, item));
    CREATE TABLE IF NOT EXISTS data_check_history (day TEXT PRIMARY KEY, total INTEGER NOT NULL)`);
  return {
    // title → Map(item → { by, at })
    accepted() {
      const found = new Map();
      for (const row of db.prepare('SELECT * FROM data_check_accepted').all()) {
        if (!found.has(row.check_title)) found.set(row.check_title, new Map());
        found.get(row.check_title).set(row.item, { by: row.accepted_by, at: row.accepted_at });
      }
      return found;
    },
    accept(title, item, by) {
      db.prepare('INSERT OR IGNORE INTO data_check_accepted VALUES (?, ?, ?, ?)').run(title, item, by, new Date().toISOString());
    },
    restore(title, item) { db.prepare('DELETE FROM data_check_accepted WHERE check_title = ? AND item = ?').run(title, item); },
    // Keeps today's total and returns the latest earlier day's, if there is one.
    record(day, total) {
      db.prepare('INSERT INTO data_check_history VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET total = excluded.total').run(day, total);
      return db.prepare('SELECT day, total FROM data_check_history WHERE day < ? ORDER BY day DESC LIMIT 1').get(day) ?? null;
    },
  };
}

// Splits each check's findings into those still open and those accepted as not a problem.
export function withDecisions(findings, accepted = new Map()) {
  return findings.map(check => {
    const decided = accepted.get(check.title) ?? new Map();
    const rows = check.items.map((text, index) => ({ text, ...check.refs?.[index] }));
    const open = rows.filter(row => !decided.has(row.text)), set = rows.filter(row => decided.has(row.text)).map(row => ({ ...row, ...decided.get(row.text) }));
    return { ...check, open, accepted: set, count: open.length };
  });
}
