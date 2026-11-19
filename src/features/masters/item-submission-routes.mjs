import express from 'express';
import { masterDefinition, MasterRecordError, recordMasters } from './records-fields.mjs';
import { recordsPage } from './records-page.mjs';
import { registerMasterDataRoutes } from '../master-data/routes.mjs';

const defaultMaster = 'item-master';
const api = '/api/masters/:master/records';
const requiredOrigin = 'Open Diesel to make changes.';

export function registerItemSubmissions(app, { store, getProfile, publicOrigin }) {
  async function signedInActor(request) {
    const profile = await getProfile(request);
    return profile ? { id: profile.login.trim().toLowerCase(), name: profile.name || profile.login } : null;
  }
  registerMasterDataRoutes(app, {
    enabledMasters: recordMasters, getActor: signedInActor,
    async listRecords(actor, slugs, { offset, limit }) {
      if (slugs.length === 1) return store.list(actor, slugs[0], { search: '', offset, limit });
      const groups = await Promise.all(slugs.map(slug => store.list(actor, slug, { search: '', offset: 0 })));
      return groups.flat().slice(offset, limit === undefined ? undefined : offset + limit);
    },
  });
  function route(handler) {
    return async (request, response, next) => {
      try {
        const actor = await signedInActor(request);
        const slug = request.params.master ?? request.query.master ?? defaultMaster;
        if (!recordMasters.includes(slug)) throw new MasterRecordError('Master records are unavailable.', 404);
        if (!actor) {
          if (request.path === '/records') return response.redirect(303, '/?master=' + slug);
          return response.status(401).json({ error: 'Sign in to Diesel.' });
        }
        await handler(request, response, actor, slug);
      } catch (error) {
        if (error instanceof MasterRecordError) return response.status(error.status).json({ error: error.message });
        next(error);
      }
    };
  }

  app.get('/records', route(async (req, res, actor, slug) => {
    const master = masterDefinition(slug);
    const { id, q: search = '' } = req.query;
    const offset = Number(req.query.offset ?? 0);
    if (typeof search !== 'string' || search.length > 256 || !Number.isSafeInteger(offset) || offset < 0) {
      throw new MasterRecordError('Choose a valid search or page.');
    }
    const creating = !id && req.query.new === '1';
    const record = id ? await store.get(actor, slug, id) : null;
    const limit = 50;
    const rows = record || creating ? [] : await store.list(actor, slug, { search, limit, offset });
    res.type('html').send(recordsPage({
      master, rows, actor, record, creating, search, status: '', offset, limit,
      editingAllowed: !record, masterSelected: true, submissionsOnly: true,
    }));
  }));

  app.post(api, route(async (req, res, actor, slug) => {
    if (req.get('origin') !== publicOrigin || req.get('sec-fetch-site') === 'cross-site') {
      return res.status(403).json({ error: requiredOrigin });
    }
    if (!req.is('application/json')) return res.status(415).json({ error: 'Send the record as JSON.' });
    return express.json({ limit: '15mb' })(req, res, async error => {
      if (error?.type === 'entity.too.large') return res.status(413).json({ error: 'The attachment exceeds the request size limit.' });
      if (error?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
      if (error) return res.status(400).json({ error: 'The record could not be read.' });
      try {
        res.status(201).json(await store.create(actor, slug, req.body?.values));
      } catch (failure) {
        res.status(failure instanceof MasterRecordError ? failure.status : 503)
          .json({ error: failure instanceof MasterRecordError ? failure.message : 'The record could not be saved. Please try again.' });
      }
    });
  }));
  app.get(api + '/:id/attachments/:fileId', route(async (req, res, actor, slug) => {
    const file = await store.attachment(actor, slug, req.params.id, req.params.fileId);
    res.attachment(file.name).type('application/octet-stream').send(file.bytes);
  }));
}
