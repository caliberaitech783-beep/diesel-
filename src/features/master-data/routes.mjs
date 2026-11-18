import { masterDefinition, MasterRecordError } from '../masters/records-fields.mjs';
import { masterDataPage } from './page.mjs';

const pageSize = 50;

export function registerMasterDataRoutes(app, { enabledMasters, getActor, listRecords, local = false }) {
  const masters = enabledMasters.map(masterDefinition);
  const bySlug = new Map(masters.map(master => [master.slug, master]));
  function route(handler) {
    return async (request, response, next) => {
      try {
        const actor = await getActor(request);
        if (!actor) {
          if (request.path === '/master-data') return response.redirect(303, '/');
          return response.status(401).json({ error: 'Sign in to Diesel.' });
        }
        const { master = '' } = request.query;
        if (master !== '' && !bySlug.has(master)) throw new MasterRecordError('Choose a listed master.', 400);
        response.set('Cache-Control', 'no-store');
        const slugs = master ? [master] : enabledMasters;
        async function records(options) {
          const saved = await listRecords(actor, slugs, options);
          return saved.map(record => {
            const definition = bySlug.get(record.master);
            return {
              id: record.id, slug: record.master, master: definition.name, code: record.code, name: record.name,
              status: record.status.replaceAll('_', ' '), site: record.site, revision: record.revision, updatedAt: record.updatedAt,
              fields: definition.fields.map(field => {
                const value = record.values[field.key];
                return [field.key, field.type === 'file' ? value?.name ?? '' : value ?? ''];
              }),
            };
          });
        }
        await handler(request, response, { actor, master, records });
      } catch (error) {
        if (error instanceof MasterRecordError) return response.status(error.status).json({ error: error.message });
        next(error);
      }
    };
  }

  app.get('/master-data', route(async (req, res, { actor, master, records }) => {
    const offset = Number(req.query.offset ?? 0);
    if (!Number.isSafeInteger(offset) || offset < 0) throw new MasterRecordError('Choose a valid page.', 400);
    const rows = await records({ offset, limit: pageSize + 1 });
    res.type('html').send(masterDataPage({
      actor, master, masters, rows: rows.slice(0, pageSize), offset, pageSize, hasMore: rows.length > pageSize, local,
    }));
  }));

  app.get('/api/master-data/records', route(async (_req, res, { records }) => {
    res.json({ records: await records({ offset: 0 }), showSite: local });
  }));
}
