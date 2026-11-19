import express from 'express';
import { assignedMasterActor } from './master-access.mjs';
import { MasterRecordError, recordMasters } from './records-fields.mjs';
import { registerMasterRecords } from './records-routes.mjs';

export const masterWorkspacePath = '/masters-workspace';

export function registerHostedMasters(app, { db, publicOrigin, getProfile, startSignIn, hasSubmissions }) {
  const workspace = express.Router();
  const secure = new URL(publicOrigin).protocol === 'https:';
  const cookie = (secure ? '__Host-' : '') + 'diesel_master_site';

  function selectedSite(req) {
    const stored = (req.get('cookie') ?? '').split(';').map(part=>part.trim()).find(part=>part.startsWith(cookie+'='));
    try { return decodeURIComponent(stored?.slice(cookie.length+1) ?? ''); } catch { return ''; }
  }

  app.use(masterWorkspacePath, async (req, res, next) => {
    try {
      const profile = await getProfile(req);
      if (!profile) {
        if (req.method === 'GET' && !req.path.startsWith('/api/') && req.accepts('html')) {
          return startSignIn(res, masterWorkspacePath);
        }
        return res.status(401).json({ error: 'Sign in to Diesel.' });
      }
      const actor = assignedMasterActor(profile, selectedSite(req));
      if (!actor) return res.status(403).send('Ask your Pulse administrator for a Master Data role at your site.');
      req.dieselMasterActor = { ...actor, hasSubmissions: hasSubmissions(profile) };
      return workspace(req,res,next);
    } catch {
      return res.status(503).json({ error: 'Pulse sign-in is temporarily unavailable.' });
    }
  });

  workspace.get('/', (_req,res) => res.redirect(303,masterWorkspacePath+'/master-data'));
  workspace.post('/site', express.urlencoded({extended:false,limit:'2kb'}), (req,res) => {
    if (req.get('origin') !== publicOrigin || req.get('sec-fetch-site') === 'cross-site') return res.sendStatus(403);
    const site = req.dieselMasterActor.masterSites.find(grant => grant.site === req.body?.site);
    if (!site) return res.sendStatus(403);
    res.cookie(cookie,site.site,{httpOnly:true,secure,sameSite:'strict',path:'/'});
    const view = req.body.view === 'records' ? '/records' : '/master-data';
    const master = recordMasters.includes(req.body.master) ? '?master='+req.body.master : '';
    return res.redirect(303,masterWorkspacePath+view+master);
  });
  registerMasterRecords(workspace,{db,enabledMasters:recordMasters,prefix:masterWorkspacePath,publicOrigin,
    getActor:request=>request.dieselMasterActor});
  workspace.use((error,_req,res,next) => {
    if (error instanceof MasterRecordError) return res.status(error.status).json({error:error.message});
    next(error);
  });
  return {
    actor(profile, req) { return assignedMasterActor(profile, selectedSite(req)); },
  };
}
