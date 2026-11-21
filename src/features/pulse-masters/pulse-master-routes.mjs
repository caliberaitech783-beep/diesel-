import { stringify } from 'csv-stringify/sync';
import { pulseMaster, pulseMastersPath } from './pulse-master-catalog.mjs';
import { pulseMasterPage } from './pulse-master-page.mjs';
import { forSite, matching, readPulseMasters } from './pulse-master-rules.mjs';
import { createPulseMasterStore } from './pulse-master-store.mjs';
import { pulseMasterExport } from './pulse-master-export.mjs';

const pageSize = 50;
const staleAfter = 30_000;
const unavailable = 'Pulse could not be reached just now. Showing the last fetched copy.';
const driversPartial = 'Pulse could not read the ERP driver list just now, so only directory drivers are shown. Retrying automatically.';
// Spreadsheet programs run cells that begin with these characters as formulas.
const cell = value => /^[=+\-@\t\r]/.test(value) ? "'" + value : value;

export function registerPulseMasters(app, { db, getAccess, fetchMasters, startSignIn, now = Date.now }) {
  const store = createPulseMasterStore(db);
  let refreshing;
  let retryAt = 0;
  // Keep Pulse's ERP availability notice while automatically retrying the feed.
  let withoutErpDrivers = false;

  // One fetch at a time, shared by everyone who opens a Pulse master while the copy is stale.
  function refresh(grant) {
    if (now() < retryAt) return false;
    refreshing ??= (async () => {
      try {
        const reply = await fetchMasters(grant);
        store.replace(readPulseMasters(reply), new Date(now()).toISOString());
        withoutErpDrivers = reply.erpDrivers === false;
        retryAt = 0;
        return true;
      } catch {
        retryAt = now() + staleAfter;
        return false;
      } finally {
        refreshing = undefined;
      }
    })();
    return refreshing;
  }

  const route = handler => async (request, response, next) => {
    try {
      const access = await getAccess(request);
      if (!access) {
        if (request.method === 'GET' && request.accepts('html')) return startSignIn(response);
        return response.status(401).json({ error: 'Sign in to Diesel.' });
      }
      const master = pulseMaster(request.method === 'GET' ? request.query.master : request.body?.master);
      if (!master) return response.status(400).send('Choose a listed Pulse master.');
      response.set('Cache-Control', 'no-store');
      await handler(request, response, access, master);
    } catch (error) {
      next(error);
    }
  };
  const visible = (master, access) => {
    const { records, syncedAt } = store.read(master.slug);
    return { records: forSite(master, records, access.sites), syncedAt };
  };
  async function ensureFresh(master, access) {
    const { syncedAt } = store.read(master.slug);
    return Boolean(syncedAt && now() - Date.parse(syncedAt) < staleAfter) || await refresh(access.grant);
  }

  app.get(pulseMastersPath, route(async (request, response, access, master) => {
    const search = typeof request.query.q === 'string' ? request.query.q.slice(0, 256) : '';
    const offset = Number(request.query.offset ?? 0);
    if (!Number.isSafeInteger(offset) || offset < 0) return response.status(400).send('Choose a valid page.');
    const refreshed = await ensureFresh(master, access);
    const { records, syncedAt } = visible(master, access);
    const found = matching(master, records, search);
    response.type('html').send(pulseMasterPage({
      actor: access.actor, master, rows: found.slice(offset, offset + pageSize), total: found.length, offset, pageSize, search,
      syncedAt, site: master.siteColumn ? access.sites?.[0] : undefined, masterDataPath: access.masterDataPath,
      notice: !refreshed ? unavailable : master.slug === 'driver' && withoutErpDrivers ? driversPartial : '',
    }));
  }));

  app.get(pulseMastersPath + '/records', route(async (_request, response, access, master) => {
    if (!await ensureFresh(master, access)) return response.status(503).json({ error: 'Download is temporarily unavailable. Try again shortly.' });
    const { records } = visible(master, access);
    response.json(pulseMasterExport(master, records));
  }));

  app.get(pulseMastersPath + '/download', route(async (_request, response, access, master) => {
    if (!await ensureFresh(master, access)) return response.status(503).send('Download is temporarily unavailable. Retrying automatically on the master page.');
    const { records } = visible(master, access);
    const rows = records.map(record => master.columns.map(([key]) => cell(record[key])));
    response.attachment(master.name + ' (Pulse).csv').type('text/csv')
      .send('﻿' + stringify([master.columns.map(([, label]) => label), ...rows]));
  }));
}
