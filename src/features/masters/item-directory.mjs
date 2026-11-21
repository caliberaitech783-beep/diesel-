import { createMasterStore } from './records.mjs';
import { MasterRecordError } from './records-fields.mjs';

const slug = 'item-master';
export const itemDirectoryPath = '/item-directory';
const normalize = value => String(value ?? '').trim().normalize('NFKC').toLowerCase();
const reviewPath = (prefix, id) => prefix + '/records?' + new URLSearchParams({master:slug,id});

// A read directory over both existing stores. Records keep their original write and approval routes.
export function createItemDirectory({ db, submissions }) {
  const shared = db ? createMasterStore(db,[slug]) : null;

  async function list(actor, {search='',status='',offset=0,limit} = {}) {
    if (typeof search !== 'string' || search.length > 256
      || !['','approved','pending','returned','pending_deactivation','pending_deletion','inactive'].includes(status)
      || !Number.isSafeInteger(offset) || offset < 0 || (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1))) {
      throw new MasterRecordError('Choose a valid item search or page.',400);
    }
    const records = submissions ? (await submissions.list(actor,slug,{search,offset:0})).map(record=>({
      ...record,
      canEdit: !actor.site && record.canEdit !== false,
      recordPath: reviewPath(actor.site ? itemDirectoryPath : '', actor.site ? 'submission-'+record.id : record.id),
    })) : [];
    if (shared) {
      for (let position=0;;position+=250) {
        const page = shared.list(slug,{search,limit:250,offset:position});
        for (const record of page) {
          const inWorkspace = actor.masterSites && normalize(actor.site) === normalize(record.site);
          records.push({...record,canEdit:Boolean(inWorkspace && actor.canEditMasters),
            recordPath:reviewPath(inWorkspace ? '/masters-workspace' : itemDirectoryPath,
              inWorkspace ? record.id : 'shared-'+record.id)});
        }
        if (page.length < 250) break;
      }
    }
    return records.filter(record=>!status || record.status===status)
      .sort((a,b)=>a.code.localeCompare(b.code,'en',{numeric:true}) || a.site.localeCompare(b.site) || a.id.localeCompare(b.id))
      .slice(offset,limit===undefined ? undefined : offset+limit);
  }

  async function read(actor, key, revision) {
    const match = /^(shared|submission)-([a-f0-9-]+)$/.exec(String(key));
    if (!match) throw new MasterRecordError('Item record not found.',404);
    const [,source,id] = match;
    if (source==='shared' && !shared || source==='submission' && !submissions) throw new MasterRecordError('Item record not found.',404);
    const current = source==='shared' ? shared.get(slug,id) : await submissions.get(actor,slug,id);
    const revisions = source==='shared' ? shared.history(slug,id) : [...(current.changes ?? [])].reverse();
    const historical = revision !== undefined;
    let record = current;
    if (historical) {
      record = source==='shared' ? shared.snapshot(slug,id,Number(revision))
        : revisions.find(event=>event.revision===Number(revision))?.snapshot;
      if (!record) throw new MasterRecordError('Record revision not found.',404);
    }
    return {record:{...record,id:key},revisions,historical,
      attachment:fileId=>source==='shared' ? shared.attachment(slug,id,fileId) : submissions.attachment(actor,slug,id,fileId)};
  }
  return {list,read};
}
