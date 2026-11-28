import { fileURLToPath } from 'node:url';
import { createPulseClient, isProof, newProof, sameProof } from './pulse-client.mjs';
import { loginPage, signInPage } from './page.mjs';
import { registerItemSubmissions } from '../masters/item-submission-routes.mjs';
import { registerHostedReview } from '../entries/hosted-review.mjs';
import { entryAssignments } from '../entries/entry-access.mjs';
import { recordMasters } from '../masters/records-fields.mjs';
import { createApprovalDelivery } from '../entries/approval-delivery.mjs';
import { registerIndentApproval } from '../indent-approval/approval-routes.mjs';
import { orderKind } from '../indent-approval/approval-kinds.mjs';
import { telegramApprovalPath } from '../entries/remote-approval.mjs';
import { approvedLocationDirectory } from '../masters/records.mjs';
import { registerEntrySetup } from '../entries/entry-setup.mjs';
import { registerHostedMasters, masterWorkspacePath } from '../masters/hosted-masters.mjs';
import { masterAssignments } from '../masters/master-access.mjs';
import { registerPulseMasters } from '../pulse-masters/pulse-master-routes.mjs';
import { createPulseCostCentres } from '../cost-centres/pulse-cost-centres.mjs';
import { registerMasterInsights } from '../master-insights/insights-routes.mjs';
import { createItemDirectory } from '../masters/item-directory.mjs';
import { registerItemDirectoryRoutes } from '../masters/item-directory-routes.mjs';
import { pulseProject } from '../masters/pulse-projects.mjs';
import { DatabaseSync } from 'node:sqlite';

const styles = fileURLToPath(new URL('./sign-in.css', import.meta.url));
const unavailable = 'Pulse sign-in is temporarily unavailable. Please try again.';
const expired = 'Your sign-in expired. Please sign in again.';
function readCookie(request, name) {
  const value = (request.get('cookie') || '').split(';')
    .map(entry => entry.trim()).find(entry => entry.startsWith(`${name}=`))?.slice(name.length + 1) || '';
  try { return decodeURIComponent(value); } catch { return ''; }
}

export function registerSignIn(app, { env, fetcher, itemSubmissions, entryReviewDirectory, siteMasterDb, sharedMasterDb, pulseMasterClock }) {
  const production = Boolean(env.WEBSITE_SITE_NAME);
  const accessMode = production ? 'pulse' : (env.DIESEL_ACCESS_MODE ?? 'guest');
  app.get('/sign-in.css', (_request, response) => response.sendFile(styles));
  if (accessMode === 'guest') {
    app.get('/login', (_request, response) => response.type('html').send(loginPage({ guest: true })));
    app.get('/', (request, response) => response.type('html').send(signInPage({ guest: true, master: request.query.master })));
    app.get('/api/sign-in/start', (_request, response) => response.redirect(303, '/'));
    return;
  }
  if (accessMode !== 'pulse') throw new Error('DIESEL_ACCESS_MODE must be guest or pulse.');

  const allowedLogins = new Set((env.DIESEL_ALLOWED_PULSE_LOGINS ?? '')
    .split(',').map(login => login.trim().toLowerCase()).filter(Boolean));
  // Every signed-in Pulse user may open Diesel. DIESEL_PULSE_ACCESS=listed limits it to the listed logins and assigned roles again.
  const everyPulseUser = env.DIESEL_PULSE_ACCESS !== 'listed';
  // A Pulse user with a Diesel site role or Entry assignment keeps exactly that; everyone else gets the listed-login access.
  const allowed = profile => typeof profile?.login === 'string' && Boolean(profile.login.trim())
    && (allowedLogins.has(profile.login.trim().toLowerCase())
      || (everyPulseUser && !masterAllowed(profile) && !entryAllowed(profile)));
  const masterAllowed = profile => Boolean(sharedMasterDb && masterAssignments(profile).length);
  const canOpenMasters = profile => allowed(profile) || masterAllowed(profile);
  const entryMode = production ? 'site-stock' : (env.DIESEL_ENTRY_ACCESS_MODE ?? 'personal-review');
  if (!['personal-review', 'assigned-pilot','site-stock'].includes(entryMode)) {
    throw new Error('DIESEL_ENTRY_ACCESS_MODE must be personal-review, assigned-pilot or site-stock.');
  }
  const hostedEntries = production || Boolean(entryReviewDirectory);
  const siteStock = entryMode === 'site-stock' && Boolean(entryReviewDirectory && siteMasterDb);
  const assigned = entryMode === 'assigned-pilot' || siteStock;
  const entryAllowed = profile => Boolean(entryReviewDirectory && assigned
    && entryAssignments(profile,siteStock,siteStock ? approvedLocationDirectory(siteMasterDb) : []).length);
  // The site-stock workspace already admits master users to the shared trial
  // when they have no Entry assignment. Its Dashboard is their home as well.
  const dashboardAllowed = profile => Boolean(entryReviewDirectory && (entryAllowed(profile)
    || (siteStock && canOpenMasters(profile)) || (!assigned && allowed(profile))));
  const denied = 'This Pulse account does not have access to Diesel.';
  const publicUrl = new URL(env.DIESEL_PUBLIC_ORIGIN || 'http://localhost:3000');
  const secure = publicUrl.protocol === 'https:';
  if (!secure && !['localhost', '127.0.0.1'].includes(publicUrl.hostname)) {
    throw new Error('DIESEL_PUBLIC_ORIGIN must use HTTPS.');
  }
  const options = { httpOnly: true, secure, sameSite: 'lax', path: '/' };
  const prefix = secure ? '__Host-' : '';
  const stateCookie = `${prefix}diesel_state`;
  const sessionCookie = `${prefix}diesel_session`;
  const configured = isProof(env.DIESEL_SSO_CLIENT_SECRET);
  const pulseOrigin = new URL(env.PULSE_ORIGIN || 'https://pulse.cmll.in');
  // Pulse uses login=1 to show sign-in even with a saved session.
  const pulseLogin = new URL('/?login=1', pulseOrigin);
  app.get('/login', (_request, response) => response.redirect(303, pulseLogin.href));
  const pulse = createPulseClient({
    origin: pulseOrigin,
    secret: env.DIESEL_SSO_CLIENT_SECRET,
    fetcher,
  });
  const page = (response, status, data = {}) => response.status(status).type('html').send(signInPage(data));
  const route = handler => async (request, response) => {
    try {
      await handler(request, response);
    } catch {
      page(response, 503, { message: unavailable });
    }
  };

  function startSignIn(response, destination) {
    if (!configured) return page(response, 503, { message: unavailable });
    const state = newProof();
    const verifier = newProof();
    response.cookie(stateCookie, [state,verifier,destination].filter(Boolean).join('.'), { ...options, maxAge: 600_000 });
    response.redirect(303, pulse.authorizationUrl(state, verifier));
  }

  function verifySession(request) {
    const grant = readCookie(request, sessionCookie);
    return configured && isProof(grant) ? pulse.request('validate', { grant }) : null;
  }

  let pulseMasterCopies, pulseMasterAccess;
  const costCentres = createPulseCostCentres({
    getAccess: request => pulseMasterAccess?.(request),
    readEquipment: access => pulseMasterCopies.read('equipment', access),
  });
  const itemDirectory = createItemDirectory({db:sharedMasterDb,submissions:itemSubmissions});
  const hostedMasters = sharedMasterDb && registerHostedMasters(app,{db:sharedMasterDb,publicOrigin:publicUrl.origin,startSignIn,itemDirectory,costCentres,
    hasSubmissions:profile=>Boolean(itemSubmissions && allowed(profile)),
    async getProfile(request) { return (await verifySession(request))?.profile ?? null; },
  });

  if (itemSubmissions || sharedMasterDb) registerItemDirectoryRoutes(app,{directory:itemDirectory,startSignIn,
    async getActor(request) {
      const profile = (await verifySession(request))?.profile;
      return canOpenMasters(profile) ? {id:profile.login.trim().toLowerCase(),name:profile.name || profile.login} : null;
    },
  });

  if (itemSubmissions || hostedMasters) {
    // Pulse's own masters, read-only. A listed login sees every site; a site role sees its site.
    pulseMasterCopies = registerPulseMasters(app, {
      db: sharedMasterDb ?? new DatabaseSync(':memory:'), publicOrigin: publicUrl.origin, startSignIn,
      fetchMasters: grant => pulse.masters(grant), now: pulseMasterClock,
      getAccess: pulseMasterAccess = async request => {
        const profile = (await verifySession(request))?.profile;
        if (!canOpenMasters(profile)) return null;
        const actor = hostedMasters?.actor(profile, request);
        const listed = Boolean(itemSubmissions && allowed(profile));
        const sites = listed || !actor ? [] : [actor.site, actor.project?.name, pulseProject(sharedMasterDb, actor.site)?.name];
        return { grant: readCookie(request, sessionCookie), actor: { id: profile.login, name: profile.name || profile.login }, sites,
          masterDataPath: actor ? masterWorkspacePath + '/master-data' : '/master-data' };
      },
    });
  }

  if (itemSubmissions) {
    let insights;
    const submissions = registerItemSubmissions(app, {
      store: itemSubmissions, publicOrigin: publicUrl.origin, itemDirectory, costCentres, homeOverview: request => insights?.homeOverview(request),
      // Location Master names, for fields that search it.
      locationNames: () => [...new Set(pulseMasterCopies?.stored('site').map(record => record.name).filter(Boolean) ?? [])].sort((first, second) => first.localeCompare(second)),
      async getProfile(request) {
        const result = await verifySession(request);
        return allowed(result?.profile) ? result.profile : null;
      },
    });
    // Counts, the site checklist and data checks over the Pulse masters and a person's visible records.
    insights = registerMasterInsights(app, { startSignIn, readPulse: pulseMasterCopies.readRecent, listRecords: submissions.listRecords, db: sharedMasterDb,
      async getAccess(request) {
        const access = await pulseMasterAccess(request);
        return access && access.masterDataPath === '/master-data' ? access : null;
      },
    });
  }

  if (hostedEntries && entryMode === 'site-stock' && !siteStock) {
    registerEntrySetup(app,{publicOrigin:publicUrl.origin,startSignIn,
      async getProfile(request) {
        const result = await verifySession(request);
        return canOpenMasters(result?.profile) ? result.profile : null;
      },
    });
  } else if (entryReviewDirectory) {
    const delivery = siteStock && configured && createApprovalDelivery(env, publicUrl.origin, fetcher);
    // Saved indents go to the people an administrator lists, on the Diesel indent Telegram bot.
    const indentApproval = sharedMasterDb ? registerIndentApproval(app, { db: sharedMasterDb, env, fetcher, publicOrigin: publicUrl.origin, startSignIn,
      async getProfile(request) { return (await verifySession(request))?.profile ?? null; },
      isAdmin: profile => typeof profile?.login === 'string' && allowedLogins.has(profile.login.trim().toLowerCase()),
    }) : undefined;
    // Saved purchase orders go to their own list of approvers, on a separate Telegram bot.
    const orderApproval = sharedMasterDb ? registerIndentApproval(app, { db: sharedMasterDb, env, fetcher, publicOrigin: publicUrl.origin, startSignIn,
      async getProfile(request) { return (await verifySession(request))?.profile ?? null; },
      isAdmin: profile => typeof profile?.login === 'string' && allowedLogins.has(profile.login.trim().toLowerCase()),
    }, orderKind) : undefined;
    registerHostedReview(app,{directory:entryReviewDirectory,publicOrigin:publicUrl.origin,assigned,indentApproval,orderApproval,
      siteMasterDb:siteStock ? siteMasterDb : undefined,startSignIn,
      readDieselRates:itemSubmissions?profile=>itemSubmissions.list({id:profile.login.trim().toLowerCase()},'diesel-rate-master',{search:'',offset:0}):undefined,
      readEmployees:pulseMasterCopies?async request=>(await pulseMasterCopies.read('employee',{
        grant:readCookie(request,sessionCookie),sites:[],
      })).records:undefined,
      approvalOptions:delivery ? { delivery, secret: env.DIESEL_SSO_CLIENT_SECRET } : undefined,
      async getProfile(request) {
        const result = await verifySession(request);
        if (assigned && typeof result?.profile?.login === 'string') {
          return { ...result.profile, dieselMastersAllowed: canOpenMasters(result.profile) };
        }
        return allowed(result?.profile) ? result.profile : null;
      },
    });
  }

  app.get('/', route(async (request, response) => {
    const grant = readCookie(request, sessionCookie);
    if (!isProof(grant)) return startSignIn(response);
    const result = await verifySession(request);
    if (canOpenMasters(result?.profile)) {
      const actor = hostedMasters?.actor(result.profile,request);
      if ((actor || itemSubmissions) && recordMasters.includes(request.query.master)) {
        const path = (actor ? masterWorkspacePath : '') + '/records?master=' + request.query.master;
        return response.redirect(303, path + (!actor || actor.canEditMasters ? '&new=1' : ''));
      }
      // Diesel opens on the Dashboard. Master Data is one click away in the menu.
      if (!request.query.master && dashboardAllowed(result.profile)) return response.redirect(303, '/entries/dashboard');
      // Without Entry, the masters are listed as cards on the Master Data page, so the bare home opens that page.
      if (!request.query.master && (itemSubmissions || actor)) return response.redirect(303, actor ? masterWorkspacePath + '/master-data' : '/master-data');
      return page(response, 200, {
        profile: result.profile, master: request.query.master, masterDataEnabled: Boolean(itemSubmissions || actor),
        masterDataPath:actor ? masterWorkspacePath + '/master-data' : undefined,
      });
    }
    if (entryAllowed(result?.profile)) return response.redirect(303, '/entries/dashboard');
    if (result?.profile?.login) {
      response.clearCookie(sessionCookie, options);
      return page(response, 403, { message: denied });
    }
    response.clearCookie(sessionCookie, options);
    return startSignIn(response);
  }));

  app.get('/api/sign-in/start', route((_request, response) => startSignIn(response)));

  app.get('/api/sign-in/callback', route(async (request, response) => {
    if (!configured) return page(response, 503, { message: unavailable });
    const { code, state } = request.query;
    const [expectedState, verifier, destination] = readCookie(request, stateCookie).split('.');
    if (!isProof(code) || !isProof(verifier) || !sameProof(state, expectedState)) {
      return page(response, 400, { message: 'This sign-in request did not match your browser. Try again.' });
    }
    response.clearCookie(stateCookie, options);
    const result = await pulse.request('exchange', { code, state, verifier });
    if (!isProof(result?.grant)) return page(response, 401, { message: expired });
    const verified = await pulse.request('validate', { grant: result.grant });
    if (!canOpenMasters(verified?.profile) && !entryAllowed(verified?.profile)) {
      response.clearCookie(sessionCookie, options);
      await pulse.request('revoke', { grant: result.grant });
      return page(response, 403, { message: denied });
    }
    response.cookie(sessionCookie, result.grant, options);
    if (destination===masterWorkspacePath && masterAllowed(verified?.profile)) return response.redirect(303, masterWorkspacePath);
    if (hostedEntries && (destination==='/entries/opening-stock' || destination==='opening-stock')) {
      return response.redirect(303,'/entries/opening-stock');
    }
    if (entryAllowed(verified?.profile) && telegramApprovalPath(destination)) return response.redirect(303, destination);
    if (hostedEntries && (destination === '/entries' || destination === 'entries')) return response.redirect(303, '/entries');
    // A plain sign-in opens the Dashboard for both assigned and shared-workspace users.
    response.redirect(303, dashboardAllowed(verified?.profile) ? '/entries/dashboard' : '/');
  }));

  app.post('/api/sign-out', route(async (request, response) => {
    if (request.get('origin') !== publicUrl.origin) return response.sendStatus(403);
    const grant = readCookie(request, sessionCookie);
    if (configured && isProof(grant)) await pulse.request('revoke', { grant });
    response.clearCookie(sessionCookie, options);
    response.redirect(303, pulseOrigin.origin + '/');
  }));
}
