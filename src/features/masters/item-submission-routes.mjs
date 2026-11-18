import express from 'express';
import { masterDefinition, MasterRecordError } from './records-fields.mjs';
import { recordsPage } from './records-page.mjs';
import { registerMasterDataRoutes } from '../master-data/routes.mjs';

const master = masterDefinition('item-master');
const api = '/api/masters/item-master/records';
const requiredOrigin = 'Open Diesel to make changes.';

export function registerItemSubmissions(app, { store, getProfile, publicOrigin }) {
  async function signedInActor(request) {
    const profile = await getProfile(request);
    return profile ? { id: profile.login.trim().toLowerCase(), name: profile.name || profile.login } : null;
  }
  registerMasterDataRoutes(app, {
    enabledMasters: [master.slug], getActor: signedInActor,
    listRecords: (actor, _slugs, page) => store.list(actor, { ...page, search: '' }),
  });
  function route(handler) {
    return async (request, response, next) => {
      try {
        const actor = await signedInActor(request);
        if (!actor) {
          if (request.path === '/records') return response.redirect(303, '/?master=item-master');
          return response.status(401).json({ error: 'Sign in to Diesel.' });
        }
        await handler(request, response, actor);
      } catch (error) {
        if (error instanceof MasterRecordError) return response.status(error.status).json({ error: error.message });
        next(error);
      }
    };
  }

  app.get('/records', route(async (req, res, actor) => {
    if (req.query.master && req.query.master !== master.slug) throw new MasterRecordError('Master records are unavailable.', 404);
    const { id, q: search = '' } = req.query;
    const offset = Number(req.query.offset ?? 0);
    if (typeof search !== 'string' || search.length > 256 || !Number.isSafeInteger(offset) || offset < 0) {
      throw new MasterRecordError('Choose a valid search or page.');
    }
    const creating = !id && req.query.new === '1';
    const record = id ? await store.get(actor, id) : null;
    const limit = 50;
    const rows = record || creating ? [] : await store.list(actor, { search, limit, offset });
    res.type('html').send(recordsPage({
      master, rows, actor, record, creating, search, status: '', offset, limit,
      editingAllowed: !record, masterSelected: true, submissionsOnly: true,
    }));
  }));

  app.post(api, route(async (req, res, actor) => {
    if (req.get('origin') !== publicOrigin || req.get('sec-fetch-site') === 'cross-site') {
      return res.status(403).json({ error: requiredOrigin });
    }
    if (!req.is('application/json')) return res.status(415).json({ error: 'Send the item as JSON.' });
    return express.json({ limit: '7mb' })(req, res, async error => {
      if (error?.type === 'entity.too.large') return res.status(413).json({ error: 'The attachment exceeds the request size limit.' });
      if (error?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
      if (error) return res.status(400).json({ error: 'The item could not be read.' });
      try {
        res.status(201).json(await store.create(actor, req.body?.values));
      } catch (failure) {
        res.status(failure instanceof MasterRecordError ? failure.status : 503)
          .json({ error: failure instanceof MasterRecordError ? failure.message : 'The item could not be saved. Please try again.' });
      }
    });
  }));
  app.get(api + '/:id/attachments/:fileId', route(async (req, res, actor) => {
    const file = await store.attachment(actor, req.params.id, req.params.fileId);
    res.attachment(file.name).type('application/octet-stream').send(file.bytes);
  }));
}
