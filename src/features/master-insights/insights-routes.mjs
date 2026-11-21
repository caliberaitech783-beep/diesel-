import express from 'express';
import { fileURLToPath } from 'node:url';
import { masters } from '../masters/catalog.mjs';
import { masterDefinition } from '../masters/records-fields.mjs';
import { pulseMasters, replacedByPulse } from '../pulse-masters/pulse-master-catalog.mjs';
import { dataChecks, equipmentBySite, missingFields, siteChecklist } from './insights.mjs';
import { insightsPage, insightsPath, overview } from './insights-page.mjs';

const assets = fileURLToPath(new URL('./assets/', import.meta.url));
const unavailable = 'Pulse could not be reached just now. Showing the last fetched copy.';

// readPulse(slug, access) → { records, syncedAt, fresh }; listRecords(actor, slug) → that person's visible records.
export function registerMasterInsights(app, { getAccess, readPulse, listRecords, startSignIn }) {
  app.use('/master-insights/assets', express.static(assets, { index: false }));
  const definitions = new Map(masters.map(({ slug }) => [slug, masterDefinition(slug)]));
  const route = handler => async (request, response, next) => {
    try {
      const access = await getAccess(request);
      if (!access) {
        if (request.accepts('html') && !request.path.startsWith('/api/')) return startSignIn(response);
        return response.status(401).json({ error: 'Sign in to Diesel.' });
      }
      response.set('Cache-Control', 'no-store');
      await handler(request, response, access);
    } catch (error) {
      next(error);
    }
  };
  const actorOf = access => ({ id: access.actor.id.trim().toLowerCase(), name: access.actor.name });
  async function pulseCopy(access) {
    const copies = {};
    let fresh = true;
    for (const { slug } of pulseMasters) {
      copies[slug] = await readPulse(slug, access);
      fresh &&= copies[slug].fresh;
    }
    return { copies, fresh };
  }
  async function masterCounts(access) {
    const actor = actorOf(access);
    return Promise.all(masters.map(async ({ slug, name }) => {
      const records = await listRecords(actor, slug);
      const definition = definitions.get(slug);
      return { slug, name, count: records.length, incomplete: records.filter(record => missingFields(definition, record.values).length).length };
    }));
  }

  async function overviewData(access, copies) {
    return { masters: (await masterCounts(access)).filter(row => !replacedByPulse(row.name)), masterDataPath: access.masterDataPath,
      pulse: pulseMasters.map(({ slug, name }) => ({ slug, name, count: copies[slug].records.length, syncedAt: copies[slug].syncedAt })) };
  }
  const siteWise = async (access, copies) => equipmentBySite({ sites: copies.site.records, equipment: copies.equipment.records,
    drivers: copies.driver.records, shifts: copies.shift.records, storage: await listRecords(actorOf(access), 'storage-location-master') });
  // The same overview as HTML for the Master Data home; null for a person these views are not for.
  async function homeOverview(request) {
    const access = await getAccess(request);
    if (!access) return null;
    const { copies, fresh } = await pulseCopy(access);
    const escape = value => String(value).replace(/[&<>"']/g, char => '&#' + char.charCodeAt(0) + ';');
    return `<nav class="insight-views" aria-label="Master Data views"><a href="${insightsPath}?view=sites">Site checklist</a><a href="${insightsPath}?view=checks">Data checks</a></nav>
      ${fresh ? '' : `<p class="record-meta" role="alert">${escape(unavailable)}</p>`}${overview({ ...await overviewData(access, copies), summary: await siteWise(access, copies) })}`;
  }

  app.get('/api/master-insights/counts', route(async (_request, response, access) => {
    const { copies } = await pulseCopy(access);
    response.json({
      pulse: Object.fromEntries(Object.entries(copies).map(([slug, copy]) => [slug, copy.records.length])),
      masters: Object.fromEntries((await masterCounts(access)).map(row => [row.slug, row.count])),
    });
  }));

  app.get(insightsPath, route(async (request, response, access) => {
    const view = ['sites', 'checks'].includes(request.query.view) ? request.query.view : 'overview';
    const { copies, fresh } = await pulseCopy(access);
    const page = { actor: access.actor, view, masterDataPath: access.masterDataPath, notice: fresh ? '' : unavailable };
    if (view === 'overview') {
      return response.type('html').send(insightsPage({ ...page, ...await overviewData(access, copies), summary: await siteWise(access, copies) }));
    }
    const actor = actorOf(access);
    const [storage, accounts] = await Promise.all([listRecords(actor, 'storage-location-master'), listRecords(actor, 'account-master')]);
    const data = { sites: copies.site.records, equipment: copies.equipment.records, drivers: copies.driver.records,
      shifts: copies.shift.records, storage, accounts };
    response.type('html').send(insightsPage(view === 'sites'
      ? { ...page, checklist: siteChecklist(data) } : { ...page, findings: dataChecks(data) }));
  }));
  return { homeOverview };
}
