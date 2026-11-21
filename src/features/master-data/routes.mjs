import { masterDefinition, MasterRecordError } from '../masters/records-fields.mjs';
import { masters } from '../masters/catalog.mjs';
import { masterDataPage } from './page.mjs';
import { attributeColumn, attributeExport, attributeMasters } from '../masters/master-attributes.mjs';
import { filterAndSort, missingFields } from '../master-insights/insights.mjs';

const pageSize = 50;

export function registerMasterDataRoutes(app, { enabledMasters, getActor, listRecords, local = false, prefix = '', attributeWarnings, homeOverview }) {
  const bySlug = new Map(masters.map(({ slug }) => {
    const definition=masterDefinition(slug);
    if ((local || prefix) && attributeMasters.has(slug)) {
      definition.fields.push({key:attributeColumn,type:'attributes'});
    }
    return [slug,definition];
  }));
  const enabled = new Set(enabledMasters);
  function route(handler) {
    return async (request, response, next) => {
      try {
        const actor = await getActor(request);
        if (!actor) {
          if (request.path === '/master-data') return response.redirect(303, '/');
          return response.status(401).json({ error: 'Sign in to Diesel.' });
        }
        const { master: slug = '' } = request.query;
        const master = bySlug.get(slug);
        if (slug !== '' && !master) throw new MasterRecordError('Choose a listed master.', 400);
        response.set('Cache-Control', 'no-store');
        const canSave = enabled.has(slug);
        const search = request.query.q ?? '';
        if (typeof search !== 'string' || search.length > 256) throw new MasterRecordError('Choose a valid search.', 400);
        const slugs = master ? (canSave ? [slug] : []) : enabledMasters;
        async function records(options) {
          if (!slugs.length) return [];
          const saved = await listRecords(actor, slugs, { search, ...options });
          return saved.map(record => {
            const definition = bySlug.get(record.master);
            return {
              id: record.id, slug: record.master, master: definition.name, code: record.code, name: record.name,
              status: record.status.replaceAll('_', ' '), site: record.site, revision: record.revision, updatedAt: record.updatedAt,
              canEdit: record.canEdit,
              missing: missingFields(definition, record.values).length,
              fields: definition.fields.map(field => {
                const value = record.values[field.key];
                return [field.key, field.type === 'attributes' ? attributeExport(record.attributes)
                  : field.type === 'file' ? value?.name ?? '' : value ?? ''];
              }),
            };
          });
        }
        await handler(request, response, { actor, master, canSave, records, search });
      } catch (error) {
        if (error instanceof MasterRecordError) return response.status(error.status).json({ error: error.message });
        next(error);
      }
    };
  }

  app.get('/master-data', route(async (req, res, { actor, master, canSave, records, search }) => {
    const offset = Number(req.query.offset ?? 0);
    if (!Number.isSafeInteger(offset) || offset < 0) throw new MasterRecordError('Choose a valid page.', 400);
    const keys = master ? master.fields.filter(field => !['file', 'attributes'].includes(field.type)).map(field => field.key) : [];
    const by = keys.includes(req.query.by) ? req.query.by : '';
    const sort = keys.includes(req.query.sort) ? req.query.sort : '';
    const dir = req.query.dir === 'desc' ? 'desc' : 'asc';
    let rows;
    if (master && (by || sort)) {
      // A column search or sort works over the whole master, then shows one page of it.
      const all = await records({ offset: 0, ...(by ? { search: '' } : {}) });
      rows = filterAndSort(all, keys, (row, key) => row.fields.find(([name]) => name === key)?.[1], { search: by ? search : '', by, sort, descending: dir === 'desc' })
        .slice(offset, offset + pageSize + 1);
    } else rows = master ? await records({ offset, limit: pageSize + 1 }) : [];
    res.type('html').send(masterDataPage({
      by, sort, dir, overview: master ? undefined : await homeOverview?.(req),
      actor, master, canSave, rows: rows.slice(0, pageSize), offset, pageSize, hasMore: rows.length > pageSize, local, prefix, search,
      warnings:master ? attributeWarnings?.(actor,master.slug) : undefined,
    }));
  }));

  app.get('/api/master-data/records', route(async (_req, res, { master, canSave, records }) => {
    if (master && !canSave) throw new MasterRecordError('Choose a master with saved records.', 400);
    res.json({
      records: await records({ offset: 0 }), showSite: local || Boolean(prefix),
      columns: master?.fields.map(field => field.key),
    });
  }));
}
