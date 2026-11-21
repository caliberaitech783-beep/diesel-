import express from 'express';
import { createMasterStore, readActiveMasters } from './records.mjs';
import { masterLocationProject } from './pulse-projects.mjs';
import { recordMasters, masterDefinition, MasterRecordError, recordDraftScope } from './records-fields.mjs';
import { recordsPage } from './records-page.mjs';
import { referenceChoices, referencedMasters } from './master-references.mjs';
import { registerMasterDataRoutes } from '../master-data/routes.mjs';
import { attributeExpiry, attributeMasters } from './master-attributes.mjs';

function requirePermission(actor, permission) {
  if (actor[permission] !== true) throw new MasterRecordError('Your workspace role cannot perform this action.', 403);
}

function scoped(record, actor) {
  if (record.site.normalize('NFKC').toLowerCase() !== actor.site.trim().normalize('NFKC').toLowerCase()) {
    throw new MasterRecordError('Master record not found.', 404);
  }
  return record;
}

export function registerMasterRecords(app, { db, getActor = request => request.dieselActor, enabledMasters = ['item-master'],
  prefix = '', publicOrigin }) {
  const store = createMasterStore(db, enabledMasters);
  async function workspaceActor(request) {
    const actor = await getActor(request);
    if (typeof actor?.id !== 'string' || !actor.id.trim() || typeof actor.site !== 'string' || !actor.site.trim()) {
      throw new MasterRecordError('Choose a master workspace site.', 401);
    }
    return actor;
  }
  registerMasterDataRoutes(app, {
    enabledMasters, local: !prefix, prefix, getActor: workspaceActor,
    listRecords: (actor, slugs, page) => store.listSaved(slugs, { ...page, site: actor.site }),
    attributeWarnings(actor,slug) {
      if (!attributeMasters.has(slug)) return [];
      return readActiveMasters(db,actor.site,[slug])[slug].flatMap(record=>
        (record.attributes??[]).flatMap(attribute=>{
          const status=attributeExpiry(attribute.validTo);
          return status ? [{id:record.id,code:record.code,revision:record.revision,name:attribute.name,
            reference:attribute.reference,due:attribute.validTo,status}] : [];
        })).sort((a,b)=>a.due.localeCompare(b.due));
    },
  });
  function enabled(slug) {
    if (!enabledMasters.includes(slug) || !recordMasters.includes(slug)) throw new MasterRecordError('Records are unavailable for this master.', 404);
  }
  function route(handler) {
    return async (request, response, next) => {
      try {
        const slug = request.params.master ?? request.query.master ?? 'item-master';
        enabled(slug);
        const actor = await workspaceActor(request);
        response.set('Cache-Control', 'no-store');
        await handler(request, response, actor, slug);
      } catch (error) {
        if (error instanceof MasterRecordError) return response.status(error.status).json({ error: error.message });
        next(error);
      }
    };
  }
  const api = '/api/masters/:master/records';
  const resource = api + '/:id';
  function checkWrite(request, response, next) {
    const origin = request.get('origin');
    let sameOrigin = publicOrigin ? origin === publicOrigin : !origin;
    if (origin && !publicOrigin) {
      try { sameOrigin = new URL(origin).origin === request.protocol + '://' + request.get('host'); } catch { sameOrigin = false; }
    }
    if (!sameOrigin || request.get('sec-fetch-site') === 'cross-site') return response.status(403).json({ error: 'Open the Diesel master workspace to make changes.' });
    if (!request.is('application/json')) return response.status(415).json({ error: 'Send the record as JSON.' });
    next();
  }
  const json = express.json({ limit: '7mb' });
  const attributeJson = express.json({ limit: '40mb' });
  const recordJson = (req,res,next) => (attributeMasters.has(req.params.master) ? attributeJson : json)(req,res,next);
  function checkScope(req,actor,slug) {
    if (prefix && req.body?.scope !== recordDraftScope(actor,slug)) {
      throw new MasterRecordError('Reopen this record with the Pulse account and site that prepared it.',409);
    }
  }
  const pagination = query => ({ search: query.q ?? '', status: query.status ?? '', limit: 50, offset: Number(query.offset ?? 0) });
  app.get('/records', route((req, res, actor, slug) => {
    const page = pagination(req.query);
    const current = req.query.id ? scoped(store.get(slug, req.query.id), actor) : null;
    const historical = Boolean(current && req.query.revision !== undefined);
    const record = historical ? store.snapshot(slug, current.id, Number(req.query.revision)) : current;
    if (req.query.new === '1') requirePermission(actor, 'canEditMasters');
    const existingLocation = slug === 'location-master' && store.list(slug, {site:actor.site,limit:1})[0];
    if (prefix && !current && req.query.new === '1' && existingLocation) {
      return res.redirect(303,prefix+'/records?master=location-master&id='+existingLocation.id);
    }
    const rows = !record && req.query.new !== '1' ? store.list(slug, { ...page, site: actor.site }) : [];
    res.set('Content-Security-Policy', `default-src 'none'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self'${slug === 'item-master' ? ' blob:' : ''}; form-action 'self'; base-uri 'none'; frame-ancestors 'self'; frame-src 'self'`);
    const project = slug === 'location-master' ? masterLocationProject(db, actor.site, actor) : null;
    const locations = slug === 'storage-location-master' ? readActiveMasters(db, actor.site, ['location-master'])['location-master'] : [];
    const hasLocation = Boolean(existingLocation);
    const references = referenceChoices(slug, readActiveMasters(db, actor.site, referencedMasters(slug)));
    const revisions = record ? store.history(slug,record.id) : [];
    const baseline = slug === 'item-master' && record ? revisions.find(event => event.revision < record.revision && (historical || record.status !== 'pending' || event.action === 'approve')) : null;
    const comparison = baseline ? store.snapshot(slug,record.id,baseline.revision) : record?.status === 'approved' ? record : null;
    res.type('html').send(recordsPage({ prefix, project, locations, hasLocation, references, comparison, master: masterDefinition(slug), rows, actor, record, ...page, masterSelected: req.query.master !== undefined,
      dialog: req.query.dialog === '1', creating: req.query.new === '1', historical, editingAllowed: !historical && actor.canEditMasters === true,
      approvingAllowed: !historical && actor.canApproveMasters === true, revisions: slug === 'item-master' && historical ? revisions.filter(event => event.revision <= record.revision) : revisions,
    }));
  }));
  app.get(api, route((req, res, actor, slug) => res.json(store.list(slug, { ...pagination(req.query), site: actor.site }))));
  app.get(resource, route((req, res, actor, slug) => res.json(scoped(store.get(slug, req.params.id), actor))));
  app.get(resource + '/history', route((req, res, actor, slug) => {
    scoped(store.get(slug, req.params.id), actor);
    res.json(store.history(slug, req.params.id));
  }));
  app.get(resource + '/revisions/:revision', route((req, res, actor, slug) => {
    scoped(store.get(slug, req.params.id), actor);
    res.json(store.snapshot(slug, req.params.id, Number(req.params.revision)));
  }));
  app.get(resource + '/attachments/:fileId', route((req, res, actor, slug) => {
    scoped(store.get(slug, req.params.id), actor);
    const file = store.attachment(slug, req.params.id, req.params.fileId);
    res.attachment(file.name).set('Content-Type', 'application/octet-stream').set('X-Content-Type-Options','nosniff').send(Buffer.from(file.bytes));
  }));
  const write = (req, res, actor, slug) => {
    requirePermission(actor, 'canEditMasters');
    checkScope(req,actor,slug);
    if (req.body?.site !== undefined && req.body.site !== actor.site) throw new MasterRecordError('Choose a record in your own site.', 403);
    const payload = { ...req.body, site: actor.site };
    if (req.params.id) {
      scoped(store.get(slug, req.params.id), actor);
      res.json(store.update(slug, req.params.id, payload, actor));
    } else res.status(201).json(store.create(slug, payload, actor));
  };
  app.post(api, checkWrite, recordJson, route(write));
  app.put(resource, checkWrite, recordJson, route(write));
  for (const action of ['approve', 'return', 'deactivate', 'reactivate', 'delete']) {
    app.post(resource + '/' + action, checkWrite, json, route((req, res, actor, slug) => {
      requirePermission(actor, ['approve', 'return'].includes(action) ? 'canApproveMasters' : 'canEditMasters');
      checkScope(req,actor,slug);
      scoped(store.get(slug, req.params.id), actor);
      res.json(store.changeStatus(slug, req.params.id, req.body?.revision, action, actor, req.body?.reason));
    }));
  }
  app.use('/api/masters', (error, _req, res, next) => {
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'The attachment exceeds the request size limit.' });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
    next(error);
  });
  return store;
}
