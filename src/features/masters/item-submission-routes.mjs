import express from 'express';
import { masterDefinition, MasterRecordError, recordMasters, recordDraftScope } from './records-fields.mjs';
import { recordsPage } from './records-page.mjs';
import { registerMasterDataRoutes } from '../master-data/routes.mjs';
import { companyRecord, companyRecords } from '../company-records/company-records.mjs';

const defaultMaster = 'item-master';
const api = '/api/masters/:master/records';
const requiredOrigin = 'Open Diesel to make changes.';

export function registerItemSubmissions(app, { store, getProfile, publicOrigin, homeOverview }) {
  async function signedInActor(request) {
    const profile = await getProfile(request);
    return profile ? { id: profile.login.trim().toLowerCase(), name: profile.name || profile.login } : null;
  }
  registerMasterDataRoutes(app, {
    enabledMasters: recordMasters, getActor: signedInActor, homeOverview,
    async listRecords(actor, slugs, { offset, limit, search = '' }) {
      const groups = await Promise.all(slugs.map(slug => listWithCompany(actor, slug, search)));
      return groups.flat().slice(offset, limit === undefined ? undefined : offset + limit);
    },
  });
  // A person's own submissions, then the company's ERP records for that master.
  async function listWithCompany(actor, slug, search) {
    const saved = await store.list(actor,slug,{search:'',offset:0,includeDeleted:true});
    const query = search.trim().normalize('NFKC').toLowerCase();
    const visible = saved.filter(record=>record.status!=='deleted' && [record.code,record.name].some(value=>value.normalize('NFKC').toLowerCase().includes(query)));
    const codes = new Set(saved.map(record=>record.code.trim().toLowerCase()));
    const sources = new Set(saved.map(record=>record.companySourceId));
    return [...visible,...companyRecords(slug,search).filter(record=>!sources.has(record.id) && !codes.has(record.code.trim().toLowerCase()))
      .map(record=>({...record,canEdit:true}))];
  }
  async function savedOrCompany(actor,slug,id) {
    try { return await store.get(actor,slug,id); } catch(error) {
      const source = companyRecord(slug,id);
      if (error.status === 404 && source) return {...source,canEdit:true};
      throw error;
    }
  }
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
    const current = id ? await savedOrCompany(actor,slug,id) : null;
    const historical = Boolean(current && req.query.revision !== undefined);
    const record = historical ? current.changes?.find(event=>event.revision===Number(req.query.revision))?.snapshot : current;
    if (historical && !record) throw new MasterRecordError('Record revision not found.',404);
    const limit = 50;
    const rows = record || creating ? [] : (await listWithCompany(actor,slug,search)).slice(offset,offset+limit);
    res.set('Content-Security-Policy', "default-src 'none'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self'; frame-src 'self'; frame-ancestors 'self'; form-action 'self'; base-uri 'none'");
    res.type('html').send(recordsPage({
      master, rows, actor, record, creating, search, status: '', offset, limit,
      dialog: req.query.dialog === '1', historical, revisions: [...(current?.changes ?? [])].reverse(),
      editingAllowed: !historical && record?.status !== 'deleted' && current?.canEdit !== false, masterSelected: true, submissionsOnly: true,
    }));
  }));
  for (const [method,path,deleting] of [['put',api+'/:id',false],['post',api+'/:id/delete',true]]) {
    app[method](path,route(async (req,res,actor,slug) => {
      if (req.get('origin') !== publicOrigin || req.get('sec-fetch-site') === 'cross-site') return res.status(403).json({error:requiredOrigin});
      if (!req.is('application/json')) return res.status(415).json({error:'Send the record as JSON.'});
      express.json({limit:'15mb'})(req,res,async error => {
        if (error) return res.status(error.type === 'entity.too.large' ? 413 : 400).json({error:'The record could not be read.'});
        try {
          if (req.body?.scope !== recordDraftScope(actor,slug)) throw new MasterRecordError('Reopen this record with the Pulse account that prepared it.',409);
          const source = companyRecord(slug,req.params.id);
          res.json(source ? await store.changeCompany(actor,slug,source,req.body,deleting)
            : await store[deleting ? 'delete' : 'update'](actor,slug,req.params.id,req.body));
        } catch (failure) {
          res.status(failure instanceof MasterRecordError ? failure.status : 503).json({error:failure instanceof MasterRecordError ? failure.message : 'The record could not be saved. Please try again.'});
        }
      });
    }));
  }

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
  return { listRecords: (actor, slug) => listWithCompany(actor, slug, '') };
}
