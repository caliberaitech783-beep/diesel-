import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, mkdir, mkdtemp, readFile, readdir, rename, rmdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { masterDefinition, MasterRecordError, recordMasters } from './records-fields.mjs';
import { createMasterStore } from './records.mjs';
import { itemSubmissionSite } from './item-site-options.mjs';

const legacyMaster = 'item-master';
const digest = value => createHash('sha256').update(value).digest('hex');
const normalize = value => value.trim().normalize('NFKC').toLowerCase();
const recordId = /^[0-9a-f]{64}$/;
const attachmentId = /^[0-9a-f-]{36}$/;

// A field renamed after records were saved: the value is read under its new label.
const renamed = { 'diesel-rate-master': { 'Transportation rate (₹/Ltr)': 'Freight rate (₹/Ltr)' } };
function current(record) {
  const names = renamed[record?.master] ?? renamed['diesel-rate-master'];
  for (const [before, after] of Object.entries(names)) {
    if (record?.values && before in record.values) { record.values[after] ??= record.values[before]; delete record.values[before]; }
  }
  return record;
}

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
        return { folder, record: current(JSON.parse(await readFile(join(folder, id, 'record.json'), 'utf8'))) };
      } catch (error) {
        if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
      }
    }
    throw new MasterRecordError('Master record not found.', 404);
  }

  async function get(actor, slug, id) {
    const {folder,record} = await locate(actor,slug,id);
    return {...record,canEdit:folder === ownerDirectory(actor,slug)};
  }

  async function list(actor, slug, { search, limit, offset, includeDeleted = false }) {
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
          record = current(JSON.parse(await readFile(join(folder, entry.name, 'record.json'), 'utf8')));
        } catch (error) {
          if (error.code === 'ENOENT') continue;
          throw error;
        }
        seen.add(entry.name);
        if (!includeDeleted && record.status === 'deleted') continue;
        if (normalize(record.code).includes(query) || normalize(record.name).includes(query)) records.push({...record,canEdit:folder === ownerDirectory(actor,slug)});
      }
    }
    return records.sort((a, b) => a.code.localeCompare(b.code)).slice(offset, limit === undefined ? undefined : offset + limit);
  }

  async function create(actor, slug, values, selectedSite) {
    const owner = ownerDirectory(actor, slug);
    const fields = masterDefinition(slug,values).fields;
    const db = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
    let record;
    const files = new Map();
    try {
      const store = createMasterStore(db, [slug]);
      const saved = store.createPrivateSubmission(slug, values, actor, slug === legacyMaster ? itemSubmissionSite(selectedSite) : undefined);
      for (const field of fields) {
        if (field.type !== 'file' || !saved.values[field.key]) continue;
        const { id, bytes } = store.attachment(slug, saved.id, saved.values[field.key].id);
        files.set(slug === legacyMaster ? 'attachment' : id, bytes);
      }
      record = { ...saved, id: digest(normalize(saved.code)) };
    } finally {
      db.close();
    }
    await uniqueCode(actor,slug,record.code);
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
    const {folder,record} = await locate(actor,slug,id);
    const snapshots = [record,...(record.changes ?? []).map(event=>event.snapshot).filter(Boolean)];
    const snapshot = snapshots.sort((a,b)=>a.revision-b.revision).find(saved=>Object.values(saved.values).some(value=>value?.id===fileId));
    const file = Object.values(snapshot?.values ?? {}).find(value => value?.id === fileId);
    if (!file || !attachmentId.test(fileId)) throw new MasterRecordError('Attachment not found.', 404);
    const filename = slug === legacyMaster && snapshot.revision === 1 ? 'attachment' : file.id;
    return { name: file.name, bytes: await readFile(join(folder,id,filename)) };
  }

  async function locked(actor, slug, operation) {
    const lock = join(directory, '.editing-'+slug);
    try { await mkdir(lock); } catch (error) {
      if (error.code === 'EEXIST') throw new MasterRecordError('Another save is in progress. Please try again.',409);
      throw error;
    }
    try { return await operation(); } finally { await rmdir(lock); }
  }

  async function uniqueCode(actor, slug, code, id) {
    const records = await list(actor,slug,{search:'',offset:0,includeDeleted:true});
    const duplicate = records.find(record => record.id !== id && normalize(record.code) === normalize(code));
    if (duplicate) {
      throw new MasterRecordError(duplicate.canEdit === false ? 'This record code is already saved by another user.' : 'You have already submitted this record code.',409);
    }
  }

  async function change(actor, slug, id, payload, deleting = false, companySource) {
    return locked(actor,slug,async () => {
      let current;
      try {
        const saved = await locate(actor,slug,id);
        if (saved.folder !== ownerDirectory(actor,slug)) throw new MasterRecordError('Only the person who saved this record can edit or delete it.',403);
        current = saved.record;
      } catch (error) {
        if (error.status !== 404 || !companySource) throw error;
        current = companySource;
      }
      if (current.status === 'deleted' || payload?.revision !== current.revision) {
        throw new MasterRecordError('This record changed. Reopen it before saving.',409);
      }
      if (typeof payload?.reason !== 'string' || !payload.reason.trim() || payload.reason.trim().length > 1000) {
        throw new MasterRecordError('Give a reason for the change (up to 1,000 characters).');
      }
      let record = current;
      const files = new Map();
      if (!deleting) {
        const values = { ...payload.values };
        if (slug === 'location-master') values['Location Code'] ??= current.code;
        for (const [key,value] of Object.entries(values)) {
          if (!value?.id) continue;
          if (current.values[key]?.id !== value.id) throw new MasterRecordError('Use an attachment belonging to this field and record.');
          const file = await attachment(actor,slug,id,value.id);
          values[key] = {name:file.name,base64:Buffer.from(file.bytes).toString('base64')};
        }
        const db = new DatabaseSync(':memory:', {enableForeignKeyConstraints:true});
        try {
          const store = createMasterStore(db,[slug]);
          record = store.createPrivateSubmission(slug,values,actor,slug === legacyMaster ? itemSubmissionSite(payload.site,current.site) : undefined);
          await uniqueCode(actor,slug,record.code,id);
          for (const field of masterDefinition(slug,values).fields) {
            if (field.type !== 'file' || !record.values[field.key]) continue;
            const file = store.attachment(slug,record.id,record.values[field.key].id);
            files.set(file.id,file.bytes);
          }
        } finally { db.close(); }
      }
      const updatedAt = new Date().toISOString();
      const revision = current.revision + 1;
      const {changes:previousChanges,...previousSnapshot} = current;
      const sourceId = current.companySourceId ?? (current.companyRecord ? current.id : undefined);
      const nextSnapshot = {...record,id,revision,updatedAt,editedBy:actor.id,status:deleting ? 'deleted' : 'pending',
        ...(sourceId ? {companyRecord:false,companySourceId:sourceId,companySourceCode:current.companySourceCode ?? current.code} : {})};
      delete nextSnapshot.changes;
      const next = {...nextSnapshot, changes:[...(previousChanges ?? [{revision:current.revision,action:'created',actorName:actor.name ?? actor.id,at:current.updatedAt,snapshot:previousSnapshot}]),
        {revision,action:deleting ? 'deleted' : 'edited',actorName:actor.name ?? actor.id,at:updatedAt,reason:payload.reason.trim(),snapshot:nextSnapshot}]};
      const folder = join(ownerDirectory(actor,slug),id);
      await mkdir(folder,{recursive:true,mode:0o700});
      // Files are immutable. Publish the new metadata only after all files exist.
      for (const [fileId,bytes] of files) await writeFile(join(folder,fileId),bytes,{mode:0o600,flush:true});
      const staged = join(folder,'.record-'+randomUUID()+'.json');
      try {
        await writeFile(staged,JSON.stringify(next),{mode:0o600,flush:true});
        await rename(staged,join(folder,'record.json'));
      } finally { await unlink(staged).catch(error=>{if(error.code!=='ENOENT') throw error;}); }
      return next;
    });
  }

  return { get, list, attachment,
    create: (actor,slug,values,site) => locked(actor,slug,() => create(actor,slug,values,site)),
    update: (actor,slug,id,payload) => change(actor,slug,id,payload),
    delete: (actor,slug,id,payload) => change(actor,slug,id,payload,true),
    changeCompany: (actor,slug,source,payload,deleting) => change(actor,slug,source.id,payload,deleting,source),
  };
}
