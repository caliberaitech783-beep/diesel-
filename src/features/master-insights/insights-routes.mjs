import express from 'express';
import { fileURLToPath } from 'node:url';
import { masters } from '../masters/catalog.mjs';
import { masterDefinition } from '../masters/records-fields.mjs';
import { pulseMasters, replacedByPulse } from '../pulse-masters/pulse-master-catalog.mjs';
import { dataChecks, equipmentBySite, missingFields, siteChecklist } from './insights.mjs';
import { insightsPage, insightsPath, masterCards } from './insights-page.mjs';
import { createCheckNotes, withDecisions } from './check-notes.mjs';
import { utils, write } from 'xlsx';

const assets = fileURLToPath(new URL('./assets/', import.meta.url));
const unavailable = 'Pulse could not be reached just now. Showing the last fetched copy.';

// readPulse(slug, access) → { records, syncedAt, fresh }; listRecords(actor, slug) → that person's visible records.
export function registerMasterInsights(app, { getAccess, readPulse, listRecords, startSignIn, db }) {
  // Decisions and history need the shared database; without it the checks still show, only without those two.
  const notes = db ? createCheckNotes(db) : null;
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
      const records = await listRecords(actor, slug, access);
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
    // The Master Data home is the masters themselves, as cards. The checks and the Pulse tables are under Data review.
    return `${fresh ? '' : `<p class="record-meta pulse-notice" role="alert">${escape(unavailable)}</p>`}${masterCards(await overviewData(access, copies))}`;
  }

  app.get('/api/master-insights/counts', route(async (_request, response, access) => {
    const { copies } = await pulseCopy(access);
    response.json({
      pulse: Object.fromEntries(Object.entries(copies).map(([slug, copy]) => [slug, copy.records.length])),
      masters: Object.fromEntries((await masterCounts(access)).map(row => [row.slug, row.count])),
    });
  }));

  app.get(insightsPath, route(async (request, response, access) => {
    const view = ['sites', 'overview'].includes(request.query.view) ? request.query.view : 'checks';
    const { copies, fresh } = await pulseCopy(access);
    const page = { actor: access.actor, view, masterDataPath: access.masterDataPath, notice: fresh ? '' : unavailable };
    if (view === 'overview') {
      return response.type('html').send(insightsPage({ ...page, ...await overviewData(access, copies), summary: await siteWise(access, copies) }));
    }
    const data = await checkData(access, copies);
    if (view === 'sites') return response.type('html').send(insightsPage({ ...page, checklist: siteChecklist(data) }));
    const findings = withDecisions(dataChecks(data), notes?.accepted());
    const total = findings.reduce((sum, check) => sum + check.count, 0);
    // Only a fresh Pulse copy is worth remembering; a stale one would show a change that did not happen.
    const before = notes && fresh ? notes.record(today(), total) : null;
    response.type('html').send(insightsPage({ ...page, findings, before, decisions: Boolean(notes), opened: request.query.open,
      progress: (await masterCounts(access)).filter(row => row.count && !replacedByPulse(row.name)) }));
  }));
  const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  async function checkData(access, copies) {
    const actor = actorOf(access);
    const [storage, accounts] = await Promise.all([listRecords(actor, 'storage-location-master'), listRecords(actor, 'account-master')]);
    return { sites: copies.site.records, equipment: copies.equipment.records, drivers: copies.driver.records, shifts: copies.shift.records, storage, accounts };
  }
  const findingsFor = async access => withDecisions(dataChecks(await checkData(access, (await pulseCopy(access)).copies)), notes?.accepted());

  // One check's open findings as an Excel file, to hand to whoever corrects them.
  app.get(insightsPath + '/check.xlsx', route(async (request, response, access) => {
    const check = (await findingsFor(access))[Number.parseInt(request.query.check, 10)];
    if (!check) return response.sendStatus(404);
    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, utils.aoa_to_sheet([[check.title], [check.help], [], ['Record', 'Site'], ...check.open.map(row => [row.text, row.site ?? ''])]), 'Findings');
    response.attachment('data-check-' + check.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60) + '.xlsx')
      .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(write(workbook, { bookType: 'xlsx', type: 'buffer', compression: true }));
  }));

  // "Not a problem" and its undo. Only a finding the checks really report can be accepted.
  if (notes) app.post(insightsPath + '/decision', express.urlencoded({ extended: false, limit: '8kb' }), route(async (request, response, access) => {
    const { check: title, item, action } = request.body ?? {};
    const findings = await findingsFor(access), index = findings.findIndex(check => check.title === title);
    if (index < 0 || typeof item !== 'string') return response.sendStatus(400);
    if (action === 'restore') notes.restore(title, item);
    else if (findings[index].open.some(row => row.text === item)) notes.accept(title, item, access.actor.name || access.actor.id);
    else return response.sendStatus(400);
    response.redirect(303, insightsPath + '?view=checks&open=' + index + '#check-' + index);
  }));
  return { homeOverview };
}
