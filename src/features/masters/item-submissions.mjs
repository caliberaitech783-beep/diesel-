import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { access, mkdir, mkdtemp, readFile, readdir, rename, rmdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { MasterRecordError } from './records-fields.mjs';
import { createMasterStore } from './records.mjs';

const master = 'item-master';
const digest = value => createHash('sha256').update(value).digest('hex');
const normalize = value => value.trim().normalize('NFKC').toLowerCase();
const recordId = /^[0-9a-f]{64}$/;

export async function openItemSubmissions(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await access(directory, constants.W_OK);
  const ownerDirectory = actor => join(directory, digest(actor.id));

  async function get(actor, id) {
    if (typeof id !== 'string' || !recordId.test(id)) throw new MasterRecordError('Item record not found.', 404);
    try {
      return JSON.parse(await readFile(join(ownerDirectory(actor), id, 'record.json'), 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') throw new MasterRecordError('Item record not found.', 404);
      throw error;
    }
  }

  async function list(actor, { search, limit, offset }) {
    let entries;
    try {
      entries = await readdir(ownerDirectory(actor), { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
    const query = normalize(search);
    const records = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !recordId.test(entry.name)) continue;
      const record = await get(actor, entry.name);
      if (normalize(record.code).includes(query) || normalize(record.name).includes(query)) records.push(record);
    }
    return records.sort((a, b) => a.code.localeCompare(b.code)).slice(offset, limit === undefined ? undefined : offset + limit);
  }

  async function create(actor, values) {
    // Validate with the same rules as Item Master in the local workspace.
    const db = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
    let record;
    let bytes;
    try {
      const store = createMasterStore(db);
      const saved = store.create(master, { values }, actor);
      const attachment = saved.values.Attachment;
      if (attachment) bytes = store.attachment(master, saved.id, attachment.id).bytes;
      record = { ...saved, id: digest(normalize(saved.code)) };
    } finally {
      db.close();
    }
    const owner = ownerDirectory(actor);
    await mkdir(owner, { recursive: true, mode: 0o700 });
    const staged = await mkdtemp(join(owner, '.saving-'));
    const metadata = join(staged, 'record.json');
    const attachment = join(staged, 'attachment');
    try {
      if (bytes) await writeFile(attachment, bytes, { mode: 0o600, flush: true });
      await writeFile(metadata, JSON.stringify(record), { mode: 0o600, flush: true });
      // Publish an entire submission atomically. A committed directory is nonempty,
      // so a simultaneous submission for the same item code cannot replace it.
      await rename(staged, join(owner, record.id));
    } catch (error) {
      for (const file of [metadata, attachment]) {
        await unlink(file).catch(cleanup => { if (cleanup.code !== 'ENOENT') throw cleanup; });
      }
      await rmdir(staged);
      if (['EEXIST', 'ENOTEMPTY', 'EPERM', 'EACCES'].includes(error.code)) {
        try {
          await get(actor, record.id);
        } catch (lookup) {
          if (lookup.status === 404) throw error;
          throw lookup;
        }
        throw new MasterRecordError('You have already submitted this item code.', 409);
      }
      throw error;
    }
    return record;
  }

  async function attachment(actor, id, fileId) {
    const record = await get(actor, id);
    const file = record.values.Attachment;
    if (!file || file.id !== fileId) throw new MasterRecordError('Attachment not found.', 404);
    return { name: file.name, bytes: await readFile(join(ownerDirectory(actor), id, 'attachment')) };
  }

  return { get, list, create, attachment };
}
