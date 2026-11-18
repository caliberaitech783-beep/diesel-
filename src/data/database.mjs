import { DatabaseSync } from 'node:sqlite';
import { closeSync, constants, fchmodSync, fstatSync, lstatSync, mkdirSync, openSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// Only the local workspace launcher selects a durable path. Tests can request :memory:.
export function openDieselDatabase(filename) {
  if (typeof filename !== 'string' || !filename.trim()) throw new Error('Choose a Diesel database path.');
  const path = filename === ':memory:' ? filename : resolve(filename);
  if (path !== ':memory:') {
    const directory = dirname(path);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    if (!lstatSync(directory).isDirectory()) throw new Error('Choose a private Diesel data directory.');
    if (lstatSync(path, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error('The Diesel database must be a regular file.');
    const fd = openSync(path, constants.O_RDWR | constants.O_CREAT | (constants.O_NOFOLLOW ?? 0), 0o600);
    try {
      const stat = fstatSync(fd);
      if (!stat.isFile() || (process.getuid && stat.uid !== process.getuid())) throw new Error('Choose an owned Diesel database file.');
      if (process.platform !== 'win32') fchmodSync(fd, 0o600);
    } finally {
      closeSync(fd);
    }
  }
  const db = new DatabaseSync(path);
  try {
    db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL');
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
