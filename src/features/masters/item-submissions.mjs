import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { access, mkdir, mkdtemp, readFile, readdir, rename, rmdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { masterDefinition, MasterRecordError, recordMasters } from './records-fields.mjs';
import { createMasterStore } from './records.mjs';

const legacyMaster = 'item-master';
const digest = value => createHash('sha256').update(value).digest('hex');
const normalize = value => value.trim().normalize('NFKC').toLowerCase();
const recordId = /^[0-9a-f]{64}$/;
const attachmentId = /^[0-9a-f-]{36}$/;

export async function openItemSubmissions(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await access(directory, constants.W_OK);
  function ownerDirectory(actor, slug) {
    if (!recordMasters.includes(slug)) throw new MasterRecordError('Master records are unavailable.', 404);
    const owner = join(directory, digest(actor.id));
    return slug === legacyMaster ? owner : join(owner, slug);
  }

  // Every signed-in Diesel user sees every submission. Each stays in the folder of the person who saved it.
  async function slugDirectories(actor, slug) {
    const own = ownerDirectory(actor, slug);
    let owners = [];
    try {
      owners = (await readdir(directory, { withFileTypes: true }))
        .filter(entry => entry.isDirectory() && recordId.test(entry.name)).map(entry => entry.name);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const folders = owners.map(owner => slug === legacyMaster ? join(directory, owner) : join(directory, owner, slug));
    return [own, ...folders.filter(folder => folder !== own)];
  }

  async function locate(actor, slug, id) {
    if (typeof id !== 'string' || !recordId.test(id)) throw new MasterRecordError('Master record not found.', 404);
    for (const folder of await slugDirectories(actor, slug)) {
      try {
        return { folder, record: JSON.parse(await readFile(join(folder, id, 'record.json'), 'utf8')) };
      } catch (error) {
        if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
      }
    }
    throw new MasterRecordError('Master record not found.', 404);
  }

  async function get(actor, slug, id) {
    return (await locate(actor, slug, id)).record;
  }

  async function list(actor, slug, { search, limit, offset }) {
    const query = normalize(search);
    const records = [], seen = new Set();
    for (const folder of await slugDirectories(actor, slug)) {
      let entries;
      try {
        entries = await readdir(folder, { withFileTypes: true });
      } catch (error) {
        if (error.code === 'ENOENT' || error.code === 'ENOTDIR') continue;
        throw error;
      }
      for (const entry of entries) {
        // The same code saved by two people before sharing began shows once: the viewer's own copy first.
        if (!entry.isDirectory() || !recordId.test(entry.name) || seen.has(entry.name)) continue;
        let record;
        try {
          record = JSON.parse(await readFile(join(folder, entry.name, 'record.json'), 'utf8'));
        } catch (error) {
          if (error.code === 'ENOENT') continue;
          throw error;
        }
        seen.add(entry.name);
        if (normalize(record.code).includes(query) || normalize(record.name).includes(query)) records.push(record);
      }
    }
    return records.sort((a, b) => a.code.localeCompare(b.code)).slice(offset, limit === undefined ? undefined : offset + limit);
  }

  async function create(actor, slug, values) {
    const owner = ownerDirectory(actor, slug);
    const fields = masterDefinition(slug).fields;
    const db = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
    let record;
    const files = new Map();
    try {
      const store = createMasterStore(db, [slug]);
      const saved = store.createPrivateSubmission(slug, values, actor);
      for (const field of fields) {
        if (field.type !== 'file' || !saved.values[field.key]) continue;
        const { id, bytes } = store.attachment(slug, saved.id, saved.values[field.key].id);
        files.set(slug === legacyMaster ? 'attachment' : id, bytes);
      }
      record = { ...saved, id: digest(normalize(saved.code)) };
    } finally {
      db.close();
    }
    // A code already saved by anyone stays unique across Diesel.
    for (const folder of (await slugDirectories(actor, slug)).slice(1)) {
      try {
        await access(join(folder, record.id, 'record.json'));
        throw new MasterRecordError('This record code is already saved by another user.', 409);
      } catch (error) {
        if (error instanceof MasterRecordError) throw error;
        if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
      }
    }
    await mkdir(owner, { recursive: true, mode: 0o700 });
    const staged = await mkdtemp(join(owner, '.saving-'));
    const metadata = join(staged, 'record.json');
    try {
      for (const [filename, bytes] of files) await writeFile(join(staged, filename), bytes, { mode: 0o600, flush: true });
      await writeFile(metadata, JSON.stringify(record), { mode: 0o600, flush: true });
      // Publish an entire submission atomically. A committed directory is nonempty,
      // so a simultaneous submission for the same code cannot replace it.
      await rename(staged, join(owner, record.id));
    } catch (error) {
      for (const file of [metadata, ...Array.from(files.keys(), filename => join(staged, filename))]) {
        await unlink(file).catch(cleanup => { if (cleanup.code !== 'ENOENT') throw cleanup; });
      }
      await rmdir(staged);
      if (['EEXIST', 'ENOTEMPTY', 'EPERM', 'EACCES'].includes(error.code)) {
        try {
          await get(actor, slug, record.id);
        } catch (lookup) {
          if (lookup.status === 404) throw error;
          throw lookup;
        }
        throw new MasterRecordError('You have already submitted this record code.', 409);
      }
      throw error;
    }
    return record;
  }

  async function attachment(actor, slug, id, fileId) {
    const { folder, record } = await locate(actor, slug, id);
    const file = Object.values(record.values).find(value => value?.id === fileId);
    if (!file || !attachmentId.test(fileId)) throw new MasterRecordError('Attachment not found.', 404);
    const filename = slug === legacyMaster ? 'attachment' : file.id;
    return { name: file.name, bytes: await readFile(join(folder, id, filename)) };
  }

  return { get, list, create, attachment };
}
