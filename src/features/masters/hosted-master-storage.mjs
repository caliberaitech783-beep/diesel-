import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { recordMasters } from './records-fields.mjs';
import { createMasterStore } from './records.mjs';

export function openHostedMasterDatabase(path) {
  mkdirSync(dirname(path),{recursive:true,mode:0o700});
  const db = new DatabaseSync(path);
  try {
    db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = DELETE');
    createMasterStore(db,recordMasters);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
