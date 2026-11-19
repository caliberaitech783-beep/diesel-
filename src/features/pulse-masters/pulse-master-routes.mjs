import express from 'express';
import { stringify } from 'csv-stringify/sync';
import { pulseMaster, pulseMastersPath } from './pulse-master-catalog.mjs';
import { pulseMasterPage } from './pulse-master-page.mjs';
import { forSite, matching, readPulseMasters } from './pulse-master-rules.mjs';
import { createPulseMasterStore } from './pulse-master-store.mjs';

const pageSize = 50;
const staleAfter = 15 * 60_000;
const unavailable = 'Pulse could not be reached just now. Showing the last fetched copy.';
// Spreadsheet programs run cells that begin with these characters as formulas.
const cell = value => /^[=+\-@\t\r]/.test(value) ? "'" + value : value;

export function registerPulseMasters(app, { db, publicOrigin, getAccess, fetchMasters, startSignIn, now = Date.now }) {
  const store = createPulseMasterStore(db);
  let refreshing;

  // One fetch at a time, shared by everyone who opens a Pulse master while the copy is stale.
  function refresh(grant) {
    refreshing ??= (async () => {
      try {
        const copy = readPulseMasters(await fetchMasters(grant));
        store.replace(copy, new Date(now()).toISOString());
        return true;
      } catch {
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

  app.get(pulseMastersPath, route(async (request, response, access, master) => {
    const search = typeof request.query.q === 'string' ? request.query.q.slice(0, 256) : '';
    const offset = Number(request.query.offset ?? 0);
    if (!Number.isSafeInteger(offset) || offset < 0) return response.status(400).send('Choose a valid page.');
    const age = store.read(master.slug).syncedAt;
    const fresh = age && now() - Date.parse(age) < staleAfter;
    const refreshed = fresh || await refresh(access.grant);
    const { records, syncedAt } = visible(master, access);
    const found = matching(master, records, search);
    response.type('html').send(pulseMasterPage({
      actor: access.actor, master, rows: found.slice(offset, offset + pageSize), total: found.length, offset, pageSize, search,
      syncedAt, site: master.siteColumn ? access.sites?.[0] : undefined, masterDataPath: access.masterDataPath,
      notice: refreshed ? (request.query.refreshed === '0' ? unavailable : '') : unavailable,
    }));
  }));

  app.get(pulseMastersPath + '/download', route((_request, response, access, master) => {
    const { records } = visible(master, access);
    const rows = records.map(record => master.columns.map(([key]) => cell(record[key])));
    response.attachment(master.name + ' (Pulse).csv').type('text/csv')
      .send('﻿' + stringify([master.columns.map(([, label]) => label), ...rows]));
  }));

  app.post(pulseMastersPath + '/refresh', express.urlencoded({ extended: false, limit: '2kb' }), route(async (request, response, access, master) => {
    if (request.get('origin') !== publicOrigin || request.get('sec-fetch-site') === 'cross-site') return response.sendStatus(403);
    const refreshed = await refresh(access.grant);
    response.redirect(303, pulseMastersPath + '?' + new URLSearchParams({ master: master.slug, ...(refreshed ? {} : { refreshed: '0' }) }));
  }));
}
