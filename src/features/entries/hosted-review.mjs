import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import { createEntriesRouter } from './routes.mjs';
import { createEntryStore } from './entry-store.mjs';
import { businessDay } from './entry-rules.mjs';
import { roles, roleKey, sites, review } from './review-masters.mjs';
import { assignedEntryActor, canChooseRole, entryAssignments } from './entry-access.mjs';
import { siteEntryWorkspace } from './site-entry-workspace.mjs';
import { siteEntryTypes } from './site-masters.mjs';
import { approvalContact } from './approval-delivery.mjs';
import { telegramApprovalPath } from './remote-approval.mjs';
import { approvedLocationDirectory } from '../masters/records.mjs';
import { masterAssignments } from '../masters/master-access.mjs';
import { createLocationsFromPulseSites } from '../masters/pulse-site-locations.mjs';
import { createPulseMasterStore } from '../pulse-masters/pulse-master-store.mjs';
import { readEntrySiteDirectory } from './entry-site-directory.mjs';
import { indentRequester } from './indent-requester.mjs';

const profiles = new Set([...roles.map(roleKey), 'entry-deputy']);
function reviewActor(site, profile) {
  return { site, profile, id: site+'-'+profile, hosted:true };
}

function seedWalkthrough(db) {
  const store = createEntryStore(db);
  db.exec('BEGIN IMMEDIATE');
  try {
    if (!db.prepare('SELECT 1 FROM entry_review_docs LIMIT 1').get()) {
      const day = businessDay();
      const actor = role => reviewActor('Jayant',roleKey(role));
      let indent = store.write(randomUUID(), actor('Site In-charge'), {type:'E1',action:'Submit',rev:0,day,data:{litres:1500,requiredBy:0,remarks:'Sample Jayant indent'}});
      for (const role of ['Project Manager','Head – Procurement']) indent = store.write(indent.id,actor(role),{action:'Approve',rev:indent.rev});
      store.write(randomUUID(),actor('Procurement Executive'),{type:'E2',action:'Submit',rev:0,day,data:{
        indent:indent.id,type:'Bulk',supplier:review.supplier,depot:review.depot,basis:'Delivered',kl:1,terms:'Advance',
      }});
    }
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK');throw error; }
}

// Trial records used to live in one private file per person. They are copied once into the shared trial workspace,
// so everyone sees the records everyone saved. The sample pair each private file started with is left behind.
export const sharedTrial = 'trial-shared';
function gatherPrivateTrials(db, directory) {
  db.exec('CREATE TABLE IF NOT EXISTS entry_review_imports(file TEXT PRIMARY KEY)');
  const done = new Set(db.prepare('SELECT file FROM entry_review_imports').all().map(row => row.file));
  for (const file of readdirSync(directory).filter(name => /^trial-[0-9a-f]{64}\.sqlite$/.test(name) && !done.has(name)).sort()) {
    let source;
    try {
      source = new DatabaseSync(join(directory,file),{readOnly:true});
      const docs = source.prepare('SELECT id,document FROM entry_review_docs').all().map(row => ({ ...row, doc: JSON.parse(row.document) }));
      const samples = new Set(docs.filter(({doc}) => doc.type==='E1' && doc.data?.remarks==='Sample Jayant indent').map(row => row.id));
      for (const {id,doc} of docs) if (doc.type==='E2' && samples.has(doc.data?.indent)) samples.add(id);
      const keep = docs.filter(row => !samples.has(row.id) && !db.prepare('SELECT 1 FROM entry_review_docs WHERE id=?').get(row.id));
      const kept = new Set(keep.map(row => row.id));
      db.exec('BEGIN IMMEDIATE');
      try {
        for (const row of keep) db.prepare('INSERT INTO entry_review_docs VALUES(?,?)').run(row.id,row.document);
        for (const row of source.prepare('SELECT doc,actor,action,stamp,snapshot FROM entry_review_history ORDER BY seq').all()) {
          if (kept.has(row.doc)) db.prepare('INSERT INTO entry_review_history(doc,actor,action,stamp,snapshot) VALUES(?,?,?,?,?)').run(row.doc,row.actor,row.action,row.stamp,row.snapshot);
        }
        for (const row of source.prepare('SELECT doc,site,day,storage,litres FROM entry_review_moves ORDER BY seq').all()) {
          if (kept.has(row.doc)) db.prepare('INSERT INTO entry_review_moves(doc,site,day,storage,litres) VALUES(?,?,?,?,?)').run(row.doc,row.site,row.day,row.storage,row.litres);
        }
        for (const row of source.prepare('SELECT id,doc,name,mime,bytes FROM entry_review_files').all()) {
          if (kept.has(row.doc)) db.prepare('INSERT OR IGNORE INTO entry_review_files VALUES(?,?,?,?,?)').run(row.id,row.doc,row.name,row.mime,row.bytes);
        }
        // New numbers continue after the highest one any person had reached.
        for (const row of source.prepare('SELECT site,type,year,n FROM entry_review_numbers').all()) {
          db.prepare('INSERT INTO entry_review_numbers VALUES(?,?,?,?) ON CONFLICT(site,type,year) DO UPDATE SET n=MAX(n,excluded.n)').run(row.site,row.type,row.year,row.n);
        }
        db.prepare('INSERT INTO entry_review_imports VALUES(?)').run(file);
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    } catch { /* A private file that cannot be read is left as it is and tried again at the next start. */ }
    finally { try { source?.close(); } catch { /* Already closed. */ } }
  }
}

export function registerHostedReview(app, { directory, publicOrigin, getProfile, startSignIn, assigned = false, siteMasterDb, approvalOptions, readEmployees, indentApproval }) {
  const routers = new Map();
  const secure = new URL(publicOrigin).protocol === 'https:';
  const siteStock = Boolean(siteMasterDb);
  const cookie = (secure ? '__Host-' : '') + (siteStock ? 'diesel_stock_assignment' : assigned ? 'diesel_entry_assignment' : 'diesel_review_context');
  // Each site named in a verified Pulse role starts with a Location Master record taken from Pulse's own Location Master.
  // Returns what happened, so a person left in the trial is told exactly why.
  const seen = new Map();
  function locationsFromPulse(profile) {
    const grants = [...masterAssignments(profile), ...(Array.isArray(profile.dieselEntryAccess) ? profile.dieselEntryAccess : [])]
      .map(grant => ({ site: grant?.site, project: grant?.project ?? undefined }));
    const mark = JSON.stringify(grants);
    if (seen.has(mark)) return seen.get(mark);
    const roleSites = [...new Set(grants.map(grant => typeof grant.site === 'string' ? grant.site.trim() : '').filter(Boolean))];
    const outcome = { roleSites, missing: [], pulseSites: 0 };
    try {
      const copy = createPulseMasterStore(siteMasterDb).read('site').records;
      outcome.pulseSites = copy.length;
      const { created, missing } = createLocationsFromPulseSites(siteMasterDb, grants, copy);
      Object.assign(outcome, { created: created.length, missing });
      // A site Pulse has not listed yet is tried again once the Location Master copy has been fetched.
      if (!missing.length) seen.set(mark, outcome);
    } catch (error) { outcome.error = String(error?.message ?? error).slice(0, 200); }
    // Counts only: the health check shows this without naming a site or a person.
    app.locals.entryLocationRun = { roleSites: roleSites.length, created: outcome.created ?? 0, notInPulseSiteMaster: outcome.missing.length,
      pulseSites: outcome.pulseSites, entryRoles: Array.isArray(profile.dieselEntryAccess) ? profile.dieselEntryAccess.length : 0,
      ...(outcome.error ? { error: outcome.error } : {}) };
    return outcome;
  }
  function trialReason(outcome, profile, locations) {
    const entrySites = (Array.isArray(profile.dieselEntryAccess) ? profile.dieselEntryAccess : []).map(grant => grant?.site).filter(site => typeof site === 'string');
    if (outcome?.error) return 'Diesel could not create the location: ' + outcome.error;
    if (!outcome?.roleSites.length) return 'Pulse sent no Diesel site role for your login, so Diesel does not know your site or post. Ask the Pulse administrator to give your login a Diesel Entry role at a site.';
    if (outcome.missing.length) return (outcome.pulseSites ? 'The Pulse Location Master has no site matching your role site: ' : 'Diesel has no copy of the Pulse Location Master yet (open Master Data, Location Master) for your role site: ') + outcome.missing.join(', ') + '.';
    if (!entrySites.length) return 'Your login has a Master Data role at ' + outcome.roleSites.join(', ') + ' but no Diesel Entry role. Ask the Pulse administrator to give your login a post such as Site In-charge at that site.';
    return 'Your Diesel Entry role sites (' + entrySites.join(', ') + ') do not match an approved location (' + locations.map(location => location.site).join(', ') + ').';
  }
  const gate = async (req,res,next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.get('origin') !== publicOrigin) return res.sendStatus(403);
    try {
      const profile = await getProfile(req);
      if (!profile) {
        if (req.method === 'GET' && req.accepts('html')) {
          const path = '/entries' + req.path;
          return startSignIn(res, (approvalOptions && telegramApprovalPath(path)) || req.path==='/opening-stock'
            ? path : '/entries');
        }
        return res.sendStatus(401);
      }
      const owner = createHash('sha256').update(profile.login.trim().toLowerCase()).digest('hex');
      const stored = (req.get('cookie') ?? '').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookie+'='))?.slice(cookie.length+1);
      let context;
      try { if (stored) context = decodeURIComponent(stored); } catch { /* Ignore damaged context cookies. */ }
      const [site,role] = (context ?? '').split('.');
      const pulseOutcome = siteStock ? locationsFromPulse(profile) : null;
      const locations = siteStock ? approvedLocationDirectory(siteMasterDb) : [];
      // A person with no Entry role at an approved site works in the trial workspace, which everyone in the trial shares:
      // a record one person saves is seen by all of them.
      // It never touches the live ledger, and live Entry opens for them once Pulse assigns a role at an approved site.
      const live = assigned && (!siteStock || locations.length) ? assignedEntryActor(profile, entryAssignments(profile,siteStock,locations), context) : null;
      const trial = siteStock && !live;
      req.dieselActor = live ?? (assigned && !trial ? null
        : reviewActor(sites.includes(site)?site:sites[0],profiles.has(role)?role:roleKey('Site In-charge')));
      if (!req.dieselActor) return res.status(403).send('Your Pulse account needs a Diesel Entry role for an approved site.');
      req.dieselActor.offlineScope = owner;
      req.dieselActor.requestedBy=profile.name||profile.login;
      if (['/new/E1','/new/E2'].includes(req.path) || req.path.startsWith('/record/')) {
        const employees=readEmployees?await readEmployees(req):siteMasterDb?createPulseMasterStore(siteMasterDb).read('employee').records:[];
        req.dieselActor.employee=indentRequester(profile,employees);
      }
      req.dieselActor.entrySites=readEntrySiteDirectory(siteMasterDb,locations);
      if (trial) { req.dieselActor.trial = locations.length ? 'role' : 'location'; req.dieselActor.trialReason = trialReason(pulseOutcome,profile,locations); }
      else if (siteStock) req.dieselActor.siteEntryTypes = siteEntryTypes;
      if (siteStock && !trial && approvalOptions) req.dieselActor.approvalContact = approvalContact(profile);
      req.reviewOwner = trial ? sharedTrial : siteStock ? 'site-stock' : assigned ? 'assigned-pilot' : owner;
      next();
    } catch { res.status(503).send('Pulse sign-in is temporarily unavailable.'); }
  };
  app.post('/workspace/role',gate,express.urlencoded({extended:false,limit:'2kb'}),(req,res)=>{
    const { assignment, returnTo } = req.body ?? {};
    const selected = req.dieselActor.assignments?.find(grant => grant.key === assignment);
    const { site, role } = selected ? { site: selected.site, role: selected.profile } : (req.body ?? {});
    if (!canChooseRole(req.dieselActor, site, role)) return res.sendStatus(assigned && !req.dieselActor.trial ? 403 : 400);
    res.cookie(cookie,site+'.'+role,{httpOnly:true,secure,sameSite:'strict',path:'/'});
    const target=typeof returnTo==='string' && /^\/entries(?:\/[a-zA-Z0-9-]+)*$/.test(returnTo) ? returnTo:'/entries';
    res.redirect(303,target+(target==='/entries/new/E1'&&req.body.indentSite==='1'?'?site='+encodeURIComponent(site):''));
  });
  app.use('/entries',gate,(req,res,next)=>{
    let router = routers.get(req.reviewOwner);
    if (!router) {
      mkdirSync(directory,{recursive:true,mode:0o700});
      const db = new DatabaseSync(join(directory,req.reviewOwner+'.sqlite'));
      try {
        db.exec('PRAGMA busy_timeout=5000');
        const trial = Boolean(req.dieselActor.trial);
        if (!assigned || trial) seedWalkthrough(db);
        if (trial) gatherPrivateTrials(db,directory);
        const stock = siteStock && !trial ? siteEntryWorkspace(db,siteMasterDb) : {};
        router = createEntriesRouter(db,trial ? {hosted:true,indentApproval} : {hosted:true,assigned,...stock,approvalOptions,indentApproval});
        routers.set(req.reviewOwner,router);
        req.socket.server.once('close',()=>{routers.delete(req.reviewOwner);db.close();});
      } catch (error) { db.close();throw error; }
    }
    router(req,res,next);
  });
}
