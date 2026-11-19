import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
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
      let indent = store.write(randomUUID(), actor('Site In-charge'), {type:'E1',action:'Submit',rev:0,day,data:{litres:1500,requiredBy:day,remarks:'Sample Jayant indent'}});
      for (const role of ['Project Manager','Head – Procurement']) indent = store.write(indent.id,actor(role),{action:'Approve',rev:indent.rev});
      store.write(randomUUID(),actor('Procurement Executive'),{type:'E2',action:'Submit',rev:0,day,data:{
        indent:indent.id,type:'Bulk',supplier:review.supplier,depot:review.depot,basis:'Delivered',kl:1,terms:'Advance',
      }});
    }
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK');throw error; }
}

export function registerHostedReview(app, { directory, publicOrigin, getProfile, startSignIn, assigned = false, siteMasterDb }) {
  const routers = new Map();
  const secure = new URL(publicOrigin).protocol === 'https:';
  const siteStock = Boolean(siteMasterDb);
  const cookie = (secure ? '__Host-' : '') + (siteStock ? 'diesel_stock_assignment' : assigned ? 'diesel_entry_assignment' : 'diesel_review_context');
  const gate = async (req,res,next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.get('origin') !== publicOrigin) return res.sendStatus(403);
    try {
      const profile = await getProfile(req);
      if (!profile) {
        if (req.method === 'GET' && req.accepts('html')) return startSignIn(res,req.path==='/opening-stock');
        return res.sendStatus(401);
      }
      const owner = createHash('sha256').update(profile.login.trim().toLowerCase()).digest('hex');
      const context = (req.get('cookie') ?? '').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookie+'='))?.slice(cookie.length+1);
      const [site,role] = (context ?? '').split('.');
      req.dieselActor = assigned ? assignedEntryActor(profile, entryAssignments(profile,siteStock), context)
        : reviewActor(sites.includes(site)?site:sites[0],profiles.has(role)?role:roleKey('Site In-charge'));
      if (!req.dieselActor) return res.status(403).send('Your Pulse account needs a Diesel Entry role for this pilot.');
      req.dieselActor.offlineScope = owner;
      if (siteStock) req.dieselActor.siteEntryTypes = siteEntryTypes;
      req.reviewOwner = siteStock ? 'site-stock' : assigned ? 'assigned-pilot' : owner;
      next();
    } catch { res.status(503).send('Pulse sign-in is temporarily unavailable.'); }
  };
  app.post('/workspace/role',gate,express.urlencoded({extended:false,limit:'2kb'}),(req,res)=>{
    const { assignment, returnTo } = req.body ?? {};
    const selected = req.dieselActor.assignments?.find(grant => grant.key === assignment);
    const { site, role } = selected ? { site: selected.site, role: selected.profile } : (req.body ?? {});
    if (!canChooseRole(req.dieselActor, site, role)) return res.sendStatus(assigned ? 403 : 400);
    res.cookie(cookie,site+'.'+role,{httpOnly:true,secure,sameSite:'strict',path:'/'});
    res.redirect(303, typeof returnTo==='string' && /^\/entries(?:\/[a-zA-Z0-9-]+)*$/.test(returnTo) ? returnTo:'/entries');
  });
  app.use('/entries',gate,(req,res,next)=>{
    let router = routers.get(req.reviewOwner);
    if (!router) {
      mkdirSync(directory,{recursive:true,mode:0o700});
      const db = new DatabaseSync(join(directory,req.reviewOwner+'.sqlite'));
      try {
        db.exec('PRAGMA busy_timeout=5000');
        if (!assigned) seedWalkthrough(db);
        const stock = siteStock ? siteEntryWorkspace(db,siteMasterDb) : {};
        router = createEntriesRouter(db,{hosted:true,assigned,...stock});
        routers.set(req.reviewOwner,router);
        req.socket.server.once('close',()=>{routers.delete(req.reviewOwner);db.close();});
      } catch (error) { db.close();throw error; }
    }
    router(req,res,next);
  });
}
