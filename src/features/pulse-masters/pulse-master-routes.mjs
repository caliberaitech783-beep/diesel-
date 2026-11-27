import express from 'express';
import { stringify } from 'csv-stringify/sync';
import { pulseMaster, pulseMastersPath } from './pulse-master-catalog.mjs';
import { pulseMasterPage } from './pulse-master-page.mjs';
import { forSite, matching, readAddedRecords, readPulseMasters } from './pulse-master-rules.mjs';
import { createPulseMasterStore } from './pulse-master-store.mjs';
import { pulseMasterExport } from './pulse-master-export.mjs';
import { filterAndSort } from '../master-insights/insights.mjs';

const pageSize = 50;
const staleAfter = 30_000;
const recentEnough = 15 * 60_000;
const unavailable = 'Pulse could not be reached just now. Showing the last fetched copy.';
const driversPartial = 'Pulse could not read the ERP driver list just now, so only directory drivers are shown. Retrying automatically.';
// Spreadsheet programs run cells that begin with these characters as formulas.
const cell = value => /^[=+\-@\t\r]/.test(value) ? "'" + value : value;

// Offices that hold diesel but are not Pulse sites. They start in the Location Master and can be removed there.
const startingLocations = [
  { name: 'CMPL Madhya Pradesh', region: '', regionCode: '', state: 'MP' },
  { name: 'CMPL Nagpur', region: '', regionCode: '', state: 'MH' },
  { name: 'CMPL Chandrapur', region: '', regionCode: '', state: 'MH' },
];

export function registerPulseMasters(app, { db, getAccess, fetchMasters, startSignIn, publicOrigin, now = Date.now }) {
  const store = createPulseMasterStore(db);
  store.seed('cmpl-locations', 'site', startingLocations, new Date(now()).toISOString());
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
    const keys = master.columns.map(([key]) => key);
    const by = keys.includes(request.query.by) ? request.query.by : '';
    const sort = keys.includes(request.query.sort) ? request.query.sort : '';
    const dir = request.query.dir === 'desc' ? 'desc' : 'asc';
    const found = by || sort ? filterAndSort(records, keys, (record, key) => record[key], { search, by, sort, descending: dir === 'desc' })
      : matching(master, records, search);
    response.type('html').send(pulseMasterPage({
      actor: access.actor, master, rows: found.slice(offset, offset + pageSize), total: found.length, offset, pageSize, search, by, sort, dir,
      syncedAt, site: master.siteColumn ? access.sites?.[0] : undefined, masterDataPath: access.masterDataPath,
      notice: !refreshed ? unavailable : master.slug === 'driver' && withoutErpDrivers ? driversPartial : '',
      message: typeof request.query.done === 'string' ? request.query.done.slice(0, 200) : '',
    }));
  }));

  // Adding by hand, importing a file and removing an added record. Pulse's own records are never changed here.
  const sameOrigin = (request, response, next) => !publicOrigin || (request.get('origin') === publicOrigin && request.get('sec-fetch-site') !== 'cross-site')
    ? next() : response.sendStatus(403);
  const page = (master, done) => pulseMastersPath + '?' + new URLSearchParams({ master: master.slug, done });
  const summary = ({ added, skipped }) => added + ' record' + (added === 1 ? '' : 's') + ' added' + (skipped ? ', ' + skipped + ' already listed and skipped' : '') + '.';
  const form = express.urlencoded({ extended: false, limit: '32kb' });
  app.post(pulseMastersPath + '/add', sameOrigin, form, route((request, response, access, master) => {
    let records;
    try { records = readAddedRecords(master, [request.body]); }
    catch (error) { return response.redirect(303, page(master, error.message)); }
    response.redirect(303, page(master, summary(store.add(master.slug, records, access.actor.name, new Date(now()).toISOString()))));
  }));
  app.post(pulseMastersPath + '/import', sameOrigin, express.json({ limit: '4mb' }), route((request, response, access, master) => {
    let records;
    try { records = readAddedRecords(master, request.body.records); }
    catch (error) { return response.status(422).json({ error: error.message }); }
    response.json({ message: summary(store.add(master.slug, records, access.actor.name, new Date(now()).toISOString())) });
  }));
  app.post(pulseMastersPath + '/remove', sameOrigin, form, route((request, response, _access, master) => {
    const id = Number(request.body.id);
    response.redirect(303, page(master, Number.isSafeInteger(id) && store.remove(master.slug, id) ? 'Record removed.' : 'That record was already removed.'));
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
  // Other Master Data views read the same copy and keep it fresh the same way.
  return { async read(slug, access) {
    const master = pulseMaster(slug);
    const fresh = await ensureFresh(master, access);
    return { ...visible(master, access), fresh };
  },
  // For the overview pages: a copy fetched within the last quarter of an hour answers at once and is refreshed
  // behind the page, so they do not wait on Pulse every time. An older copy, or none, is fetched before answering.
  async readRecent(slug, access) {
    const master = pulseMaster(slug), { syncedAt } = store.read(master.slug);
    const age = syncedAt ? now() - Date.parse(syncedAt) : Infinity;
    if (age < staleAfter) return { ...visible(master, access), fresh: true };
    if (age < recentEnough) {
      const failing = now() < retryAt;
      if (!failing) void refresh(access.grant);
      return { ...visible(master, access), fresh: !failing };
    }
    const fresh = await refresh(access.grant);
    return { ...visible(master, access), fresh };
  },
  // The copy as last stored, with the records added in Diesel, without asking Pulse again.
  stored: slug => store.read(slug).records };
}
