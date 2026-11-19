import { randomUUID } from 'node:crypto';
import { recordIdentity, recordMasters, masterDefinition, MasterRecordError, validateScalar } from './records-fields.mjs';
import { preparePulseProjects, pulseProject } from './pulse-projects.mjs';
import { validateStorage } from './storage-rules.mjs';
import { invoiceRate } from './assets/invoice-rate.mjs';

const maxFileBytes = 5 * 1024 * 1024;
const normalize = text => text.trim().normalize('NFKC').toLowerCase();
const isObject = object => object && typeof object === 'object' && !Array.isArray(object);

function atomically(db, operation) {
  const nested = db.isTransaction;
  const savepoint = nested ? 'master_' + randomUUID().replaceAll('-', '') : null;
  db.exec(nested ? 'SAVEPOINT ' + savepoint : 'BEGIN IMMEDIATE');
  try {
    const result = operation();
    db.exec(nested ? 'RELEASE ' + savepoint : 'COMMIT');
    return result;
  } catch (error) {
    db.exec(nested ? 'ROLLBACK TO ' + savepoint + '; RELEASE ' + savepoint : 'ROLLBACK');
    throw error;
  }
}

function identity(actor) {
  const id = typeof actor === 'string' ? actor : actor?.id;
  if (typeof id !== 'string' || !id.trim() || id.length > 200) throw new MasterRecordError('Choose a workspace actor.', 401);
  return { id: id.trim(), name: String(actor?.name ?? id).slice(0, 200) };
}

function unpack(row) {
  return {
    id: row.id, master: row.master, code: row.code, name: row.name, site: row.site,
    status: row.status, revision: row.revision, values: JSON.parse(row.values_json),
    editedBy: row.edited_by, updatedAt: row.updated_at,
  };
}

export function readActiveMasters(db, site, enabledMasters = ['item-master']) {
  const available = Object.fromEntries(enabledMasters.filter(slug => recordMasters.includes(slug)).map(slug => [slug, []]));
  const approved = db.prepare(`SELECT h.snapshot FROM master_records m JOIN master_history h
    ON h.record_id=m.id AND h.revision=m.approved_revision
    WHERE m.status!='inactive' AND (m.approved_site_key='' OR m.approved_site_key=?) ORDER BY m.master, m.code`).all(normalize(String(site ?? '')));
  for (const row of approved) {
    const item = JSON.parse(row.snapshot);
    if (available[item.master] && !['inactive', 'disabled', 'retired', 'closed', 'expired', 'suspended'].includes(normalize(String(item.values.Status ?? '')))) available[item.master].push(item);
  }
  return available;
}

export function createMasterStore(db, enabledMasters = ['item-master']) {
  function definition(slug) {
    if (!enabledMasters.includes(slug) || !recordMasters.includes(slug)) throw new MasterRecordError('Records are unavailable for this master.', 404);
    return masterDefinition(slug);
  }
  preparePulseProjects(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS master_records (
      id TEXT PRIMARY KEY, master TEXT NOT NULL, code TEXT NOT NULL, code_key TEXT NOT NULL,
      name TEXT NOT NULL, site TEXT NOT NULL, site_key TEXT NOT NULL,
      revision INTEGER NOT NULL, status TEXT NOT NULL, values_json TEXT NOT NULL,
      edited_by TEXT NOT NULL, updated_at TEXT NOT NULL,
      approved_revision INTEGER, approved_code_key TEXT, approved_site_key TEXT,
      UNIQUE(master,site_key,code_key)
    );
    CREATE TABLE IF NOT EXISTS master_history (
      record_id TEXT NOT NULL REFERENCES master_records(id), revision INTEGER NOT NULL,
      action TEXT NOT NULL, actor_id TEXT NOT NULL, actor_name TEXT NOT NULL, happened_at TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '',
      snapshot TEXT NOT NULL, PRIMARY KEY(record_id,revision)
    );
    CREATE TABLE IF NOT EXISTS master_files (
      id TEXT PRIMARY KEY, record_id TEXT NOT NULL REFERENCES master_records(id) DEFERRABLE INITIALLY DEFERRED,
      field_key TEXT NOT NULL, name TEXT NOT NULL, bytes BLOB NOT NULL
    );
  `);

  function get(slug, id) {
    definition(slug);
    const row = db.prepare('SELECT * FROM master_records WHERE master=? AND id=?').get(slug, id);
    if (!row) throw new MasterRecordError('Master record not found.', 404);
    return unpack(row);
  }

  function history(slug, id) {
    get(slug, id);
    return db.prepare(`SELECT revision,action,actor_id AS actorId,actor_name AS actorName,happened_at AS at,reason
      FROM master_history WHERE record_id=? ORDER BY revision DESC`).all(id);
  }

  function snapshot(slug, id, revision) {
    get(slug, id);
    const row = db.prepare('SELECT snapshot FROM master_history WHERE record_id=? AND revision=?').get(id, revision);
    if (!row) throw new MasterRecordError('Record revision not found.', 404);
    return JSON.parse(row.snapshot);
  }

  function attachment(slug, id, fileId) {
    get(slug, id);
    const file = db.prepare('SELECT id,name,bytes FROM master_files WHERE record_id=? AND id=?').get(id, fileId);
    if (!file) throw new MasterRecordError('Attachment not found.', 404);
    return file;
  }

  function fileValue(id, field, raw) {
    if (!isObject(raw)) throw new MasterRecordError('Choose a file for ' + field.label + '.');
    if (raw.id) {
      if (typeof raw.id !== 'string') throw new MasterRecordError('Choose a valid attachment.');
      const file = db.prepare('SELECT id,name,length(bytes) AS size FROM master_files WHERE id=? AND record_id=? AND field_key=?').get(raw.id, id, field.key);
      if (!file) throw new MasterRecordError('Use an attachment belonging to this field and record.');
      return file;
    }
    const { name, base64 } = raw;
    if (typeof name !== 'string' || !name.trim() || name.length > 200 || /[\\/\x00-\x1f\x7f]/.test(name)) throw new MasterRecordError('Choose a file with a valid name.');
    if (typeof base64 !== 'string' || !base64.length || base64.length > Math.ceil(maxFileBytes / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new MasterRecordError('Attachments must be 5 MiB or smaller.');
    const data = Buffer.from(base64, 'base64');
    if (data.length > maxFileBytes || data.toString('base64') !== base64) throw new MasterRecordError('Invalid attachment data.');
    const suffix = name.toLowerCase().split('.').at(-1);
    const hex = data.subarray(0, 16).toString('hex');
    const accepted = (suffix === 'pdf' && data.subarray(0, 5).toString('ascii') === '%PDF-')
      || (suffix === 'png' && hex.startsWith('89504e470d0a1a0a'))
      || (['jpg','jpeg'].includes(suffix) && hex.startsWith('ffd8ff'))
      || (suffix === 'webp' && data.subarray(0,4).toString() === 'RIFF' && data.subarray(8,12).toString() === 'WEBP')
      || (suffix === 'gif' && ['GIF87a','GIF89a'].includes(data.subarray(0,6).toString()));
    if (!accepted) throw new MasterRecordError('Choose a PDF, PNG, JPEG, WebP or GIF attachment.');
    const file = { id: randomUUID(), name: name.trim(), size: data.length };
    db.prepare('INSERT INTO master_files (id,record_id,field_key,name,bytes) VALUES (?,?,?,?,?)').run(file.id, id, field.key, file.name, data);
    return file;
  }

  function cleanValues(master, id, input) {
    if (!isObject(input)) throw new MasterRecordError('Supply the master fields.');
    const known = new Set(master.fields.map(field => field.key));
    if (Object.keys(input).some(key => !known.has(key))) throw new MasterRecordError('The record contains unknown fields.');
    const values = {};
    for (const field of master.fields) {
      const raw = input[field.key];
      if (raw === undefined || raw === null || raw === '') continue;
      if (field.readOnly) continue;
      if (field.type === 'file') {
        const file = fileValue(id, field, raw);
        values[field.key] = file;
      } else {
        const value = validateScalar(field, raw);
        if (value) values[field.key] = value;
      }
    }
    for (const field of master.fields) {
      if (field.controlKey === 'calibration-chart' && values['Storage type'] !== 'UG tank') continue;
      if (field.required && !field.readOnly && !values[field.key]) throw new MasterRecordError(field.label + ' is required.');
    }
    if (master.slug === 'storage-location-master') validateStorage(values);
    if (master.slug === 'diesel-rate-master') {
      const rate = invoiceRate(values['Total invoice amount (₹, including all charges)'], values['Invoice quantity (L)']);
      if (!rate) throw new MasterRecordError('Enter a positive invoice amount and quantity to calculate the diesel rate.');
      values['Diesel rate (₹/KL), worked out'] = String(rate.perKilolitre);
    }
    if (master.slug !== 'item-master') return values;
    const minimum = Number(values['Density minimum (kg/m³)']);
    const maximum = Number(values['Density maximum (kg/m³)']);
    if (minimum <= 0 || maximum < minimum) throw new MasterRecordError('The density range needs a positive minimum and a maximum at least as high.');
    if (values['Bulk Density'] && Number(values['Bulk Density']) <= 0) throw new MasterRecordError('Bulk Density must be positive.');
    return values;
  }

  function assertRevision(record, revision) {
    if (!Number.isSafeInteger(revision) || revision !== record.revision) throw new MasterRecordError('This record changed. Reopen it before saving.', 409);
  }

  function audit(record, action, actor, reason = '') {
    db.prepare('INSERT INTO master_history(record_id,revision,action,actor_id,actor_name,happened_at,reason,snapshot) VALUES (?,?,?,?,?,?,?,?)').run(
      record.id, record.revision, action, actor.id, actor.name, record.updatedAt, reason, JSON.stringify(record),
    );
    return record;
  }

  function changeReason(reason) {
    if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 1000) throw new MasterRecordError('Give a reason for the change (up to 1,000 characters).');
    return reason.trim();
  }

  function save(slug, id, payload, actor, privateSubmission = false) {
    const editor = identity(actor);
    const master = definition(slug);
    if (!isObject(payload)) throw new MasterRecordError('Supply the master record.');
    const current = id ? get(slug, id) : null;
    if (current) {
      assertRevision(current, payload.revision);
      if (['inactive','pending_deactivation'].includes(current.status)) throw new MasterRecordError('This record cannot be edited in its current state.', 409);
    }
    const recordId = current?.id ?? randomUUID();
    const site = payload.site ?? current?.site ?? '';
    if (typeof site !== 'string' || site.trim().length > 120) throw new MasterRecordError('Choose a valid site.');
    const siteKey = normalize(site);
    let input = payload.values;
    if (slug === 'shift-master' && !privateSubmission) {
      if (input?.Site && input.Site !== site) throw new MasterRecordError('Choose a shift for the current site.');
      input = { ...input, Site: site };
    }
    if (slug === 'location-master' && !privateSubmission) {
      const project = pulseProject(db, site);
      if (!project) throw new MasterRecordError('Sync the project directory from Pulse 1 first.');
      if (!current && db.prepare("SELECT 1 FROM master_records WHERE master='location-master' AND site_key=?").get(siteKey)) {
        throw new MasterRecordError('This Pulse project already has a Location record. Open it to make changes.', 409);
      }
      input = { ...input, 'Location Code': input?.['Location Code'] ?? current?.code, 'Location Name': project.name, Client: project.client };
    }
    const values = cleanValues(master, recordId, input);
    const { code, name } = recordIdentity(slug, values);
    if (slug === 'location-master' && current && current.code !== code) throw new MasterRecordError('The saved location code is used by storage records and cannot change.');
    if (slug === 'storage-location-master' && !privateSubmission) requireLocation(site, values.Location);
    const codeKey = normalize(code);
    const conflict = db.prepare(`SELECT id FROM master_records WHERE master=? AND id!=? AND (
      (code_key=? AND (site_key='' OR ?='' OR site_key=?)) OR
      (approved_code_key=? AND (approved_site_key='' OR ?='' OR approved_site_key=?))) LIMIT 1`)
      .get(slug, recordId, codeKey, siteKey, siteKey, codeKey, siteKey, siteKey);
    if (conflict) throw new MasterRecordError('This record code already exists for this master and site.', 409);
    const revision = (current?.revision ?? 0) + 1;
    const updatedAt = new Date().toISOString();
    db.prepare(`INSERT INTO master_records (id,master,code,code_key,name,site,site_key,revision,status,values_json,edited_by,updated_at)
      VALUES (?,?,?,?,?,?,?,?,'pending',?,?,?) ON CONFLICT(id) DO UPDATE SET code=excluded.code,code_key=excluded.code_key,
      name=excluded.name,site=excluded.site,site_key=excluded.site_key,revision=excluded.revision,status='pending',
      values_json=excluded.values_json,edited_by=excluded.edited_by,updated_at=excluded.updated_at`)
      .run(recordId, slug, code, codeKey, name, site.trim(), siteKey, revision, JSON.stringify(values), editor.id, updatedAt);
    return audit(get(slug, recordId), current ? 'edited' : 'created', editor, current ? changeReason(payload.reason) : '');
  }

  function requireLocation(site, code) {
    const locations = readActiveMasters(db, site, ['location-master'])['location-master'];
    if (!locations.some(location => location.code === code && location.site === site)) {
      throw new MasterRecordError('Select an approved location for this site.');
    }
  }

  function changeStatus(slug, id, revision, action, actor, reason) {
    const editor = identity(actor);
    return atomically(db, () => {
      const current = get(slug, id);
      assertRevision(current, revision);
      let status;
      if (action === 'approve' && ['pending','pending_deactivation'].includes(current.status)) {
        if (normalize(editor.id) === normalize(current.editedBy)) throw new MasterRecordError('A different actor must approve this revision.', 403);
        status = current.status === 'pending_deactivation' || current.values.Status === 'Inactive' ? 'inactive' : 'approved';
      } else if (action === 'deactivate' && ['approved','pending'].includes(current.status)) {
        status = 'pending_deactivation';
      } else if (action === 'reactivate' && current.status === 'inactive') {
        status = 'pending';
      } else {
        throw new MasterRecordError('This action is unavailable for the current record status.', 409);
      }
      const nextRevision = revision + 1;
      if (slug === 'storage-location-master' && (status === 'approved' || action === 'reactivate')) requireLocation(current.site, current.values.Location);
      if (slug === 'location-master' && (action === 'deactivate' || status === 'inactive')) {
        const dependent = db.prepare("SELECT 1 FROM master_records WHERE master='storage-location-master' AND site_key=? AND status!='inactive' LIMIT 1").get(normalize(current.site));
        if (dependent) throw new MasterRecordError('Deactivate this project’s storage records before retiring its location.', 409);
      }
      const timestamp = new Date().toISOString();
      const values = { ...current.values };
      if (slug !== 'location-master' && action === 'reactivate') values.Status = 'Active';
      if (slug !== 'location-master' && status === 'inactive') values.Status = 'Inactive';
      db.prepare(`UPDATE master_records SET status=?,revision=?,updated_at=?,edited_by=?,values_json=?,
        approved_revision=CASE WHEN ?='approved' THEN ? WHEN ?='inactive' THEN NULL ELSE approved_revision END,
        approved_code_key=CASE WHEN ?='approved' THEN code_key WHEN ?='inactive' THEN NULL ELSE approved_code_key END,
        approved_site_key=CASE WHEN ?='approved' THEN site_key WHEN ?='inactive' THEN NULL ELSE approved_site_key END WHERE id=?`)
        .run(status, nextRevision, timestamp, action === 'approve' ? current.editedBy : editor.id, JSON.stringify(values), status, nextRevision, status, status, status, status, status, id);
      return audit(get(slug, id), action, editor, action === 'approve' ? '' : changeReason(reason));
    });
  }

  function queryRecords(slugs, { search, status, site, limit, offset }) {
    const placeholders = slugs.map(() => '?').join(',');
    return db.prepare(`SELECT * FROM master_records WHERE master IN (${placeholders}) AND (?='' OR status=?)
      AND (? IS NULL OR site_key=?)
      AND (instr(lower(code),lower(?))>0 OR instr(lower(name),lower(?))>0)
      ORDER BY master,code COLLATE NOCASE,id LIMIT ? OFFSET ?`)
      .all(...slugs, status, status, site, site === null ? null : normalize(site), search, search, limit, offset).map(unpack);
  }

  function list(slug, { search = '', status = '', site = null, limit = 100, offset = 0 } = {}) {
    definition(slug);
    if (typeof search !== 'string' || search.length > 256 || !['', 'approved', 'pending', 'pending_deactivation', 'inactive'].includes(status)) throw new MasterRecordError('Choose a valid search or status.');
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 250 || !Number.isSafeInteger(offset) || offset < 0) throw new MasterRecordError('Invalid page.');
    return queryRecords([slug], { search, status, site, limit, offset });
  }

  function listSaved(slugs, { site, limit = -1, offset = 0 }) {
    for (const slug of slugs) definition(slug);
    if (typeof site !== 'string' || !site.trim()) throw new MasterRecordError('Choose a workspace site.', 401);
    return queryRecords(slugs, { site, limit, offset, search: '', status: '' });
  }

  return { get, list, listSaved, history, snapshot, attachment, changeStatus,
    createPrivateSubmission: (slug, values, actor) => atomically(db, () => save(slug, null, { values }, actor, true)),
    create: (slug, payload, actor) => atomically(db, () => save(slug, null, payload, actor)),
    update: (slug, id, payload, actor) => atomically(db, () => save(slug, id, payload, actor)),
  };
}
