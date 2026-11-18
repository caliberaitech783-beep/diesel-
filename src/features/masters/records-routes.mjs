import express from 'express';
import { createMasterStore, readActiveMasters } from './records.mjs';
import { pulseProject } from './pulse-projects.mjs';
import { recordMasters, masterDefinition, MasterRecordError } from './records-fields.mjs';
import { recordsPage } from './records-page.mjs';

function requirePermission(actor, permission) {
  if (actor[permission] !== true) throw new MasterRecordError('Your workspace role cannot perform this action.', 403);
}

function scoped(record, actor) {
  if (record.site.toLowerCase() !== actor.site.trim().toLowerCase()) throw new MasterRecordError('Master record not found.', 404);
  return record;
}

export function registerMasterRecords(app, { db, getActor = request => request.dieselActor, enabledMasters = ['item-master'] }) {
  const store = createMasterStore(db, enabledMasters);
  function enabled(slug) {
    if (!enabledMasters.includes(slug) || !recordMasters.includes(slug)) throw new MasterRecordError('Records are unavailable for this master.', 404);
  }
  function route(handler) {
    return async (request, response, next) => {
      try {
        const slug = request.params.master ?? request.query.master ?? 'item-master';
        enabled(slug);
        const actor = await getActor(request);
        if (typeof actor?.id !== 'string' || !actor.id.trim() || typeof actor.site !== 'string' || !actor.site.trim()) {
          throw new MasterRecordError('Choose an actor in the local workspace.', 401);
        }
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
    let sameOrigin = !origin;
    if (origin) {
      try { sameOrigin = new URL(origin).origin === request.protocol + '://' + request.get('host'); } catch { sameOrigin = false; }
    }
    if (!sameOrigin || request.get('sec-fetch-site') === 'cross-site') return response.status(403).json({ error: 'Use the local workspace to make changes.' });
    if (!request.is('application/json')) return response.status(415).json({ error: 'Send the record as JSON.' });
    next();
  }
  const json = express.json({ limit: '7mb' });
  const pagination = query => ({ search: query.q ?? '', status: query.status ?? '', limit: 50, offset: Number(query.offset ?? 0) });
  app.get('/records', route((req, res, actor, slug) => {
    const page = pagination(req.query);
    const current = req.query.id ? scoped(store.get(slug, req.query.id), actor) : null;
    const historical = Boolean(current && req.query.revision !== undefined);
    const record = historical ? store.snapshot(slug, current.id, Number(req.query.revision)) : current;
    if (req.query.new === '1') requirePermission(actor, 'canEditMasters');
    const rows = !record && req.query.new !== '1' ? store.list(slug, { ...page, site: actor.site }) : [];
    res.set('Content-Security-Policy', "default-src 'none'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
    const project = slug === 'location-master' ? pulseProject(db, actor.site) : null;
    const locations = slug === 'storage-location-master' ? readActiveMasters(db, actor.site, ['location-master'])['location-master'] : [];
    const hasLocation = slug === 'location-master' && store.list(slug, {site: actor.site, limit: 1}).length > 0;
    res.type('html').send(recordsPage({ project, locations, hasLocation, master: masterDefinition(slug), rows, actor, record, ...page, masterSelected: req.query.master !== undefined,
      creating: req.query.new === '1', historical, editingAllowed: !historical && actor.canEditMasters === true,
      approvingAllowed: !historical && actor.canApproveMasters === true, revisions: record ? store.history(slug, record.id) : [],
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
    if (req.body?.site !== undefined && req.body.site !== actor.site) throw new MasterRecordError('Choose a record in your own site.', 403);
    const payload = { ...req.body, site: actor.site };
    if (req.params.id) {
      scoped(store.get(slug, req.params.id), actor);
      res.json(store.update(slug, req.params.id, payload, actor));
    } else res.status(201).json(store.create(slug, payload, actor));
  };
  app.post(api, checkWrite, json, route(write));
  app.put(resource, checkWrite, json, route(write));
  for (const action of ['approve', 'deactivate', 'reactivate']) {
    app.post(resource + '/' + action, checkWrite, json, route((req, res, actor, slug) => {
      requirePermission(actor, action === 'approve' ? 'canApproveMasters' : 'canEditMasters');
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
