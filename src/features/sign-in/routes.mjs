import { fileURLToPath } from 'node:url';
import { createPulseClient, isProof, newProof, sameProof } from './pulse-client.mjs';
import { loginPage, signInPage } from './page.mjs';
import { registerItemSubmissions } from '../masters/item-submission-routes.mjs';
import { registerHostedReview } from '../entries/hosted-review.mjs';
import { entryAssignments } from '../entries/entry-access.mjs';
import { recordMasters } from '../masters/records-fields.mjs';

const styles = fileURLToPath(new URL('./sign-in.css', import.meta.url));
const unavailable = 'Pulse sign-in is temporarily unavailable. Please try again.';
const expired = 'Your sign-in expired. Please sign in again.';
const readCookie = (request, name) => (request.get('cookie') || '').split(';')
  .map(entry => entry.trim()).find(entry => entry.startsWith(`${name}=`))?.slice(name.length + 1) || '';

export function registerSignIn(app, { env, fetcher, itemSubmissions, entryReviewDirectory }) {
  const accessMode = env.WEBSITE_SITE_NAME ? 'pulse' : (env.DIESEL_ACCESS_MODE ?? 'guest');
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
  const allowed = profile => typeof profile?.login === 'string' && allowedLogins.has(profile.login.trim().toLowerCase());
  const entryMode = env.DIESEL_ENTRY_ACCESS_MODE ?? 'personal-review';
  if (!['personal-review', 'assigned-pilot'].includes(entryMode)) {
    throw new Error('DIESEL_ENTRY_ACCESS_MODE must be personal-review or assigned-pilot.');
  }
  const assigned = entryMode === 'assigned-pilot';
  const entryAllowed = profile => Boolean(entryReviewDirectory && assigned && entryAssignments(profile).length);
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
    response.cookie(stateCookie, `${state}.${verifier}${destination === 'entries' ? '.entries' : ''}`, { ...options, maxAge: 600_000 });
    response.redirect(303, pulse.authorizationUrl(state, verifier));
  }

  function verifySession(request) {
    const grant = readCookie(request, sessionCookie);
    return configured && isProof(grant) ? pulse.request('validate', { grant }) : null;
  }

  if (itemSubmissions) {
    registerItemSubmissions(app, {
      store: itemSubmissions, publicOrigin: publicUrl.origin,
      async getProfile(request) {
        const result = await verifySession(request);
        return allowed(result?.profile) ? result.profile : null;
      },
    });
  }

  if (entryReviewDirectory) {
    registerHostedReview(app,{directory:entryReviewDirectory,publicOrigin:publicUrl.origin,assigned,startSignIn:response=>startSignIn(response,'entries'),
      async getProfile(request) {
        const result = await verifySession(request);
        if (assigned && typeof result?.profile?.login === 'string') {
          return { ...result.profile, dieselMastersAllowed: allowed(result.profile) };
        }
        return allowed(result?.profile) ? result.profile : null;
      },
    });
  }

  app.get('/', route(async (request, response) => {
    const grant = readCookie(request, sessionCookie);
    if (!isProof(grant)) return startSignIn(response);
    const result = await verifySession(request);
    if (allowed(result?.profile)) {
      if (itemSubmissions && recordMasters.includes(request.query.master)) {
        return response.redirect(303, '/records?master=' + request.query.master + '&new=1');
      }
      return page(response, 200, {
        profile: result.profile, master: request.query.master, masterDataEnabled: Boolean(itemSubmissions),
      });
    }
    if (entryAllowed(result?.profile)) return response.redirect(303, '/entries');
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
    if (!allowed(verified?.profile) && !entryAllowed(verified?.profile)) {
      response.clearCookie(sessionCookie, options);
      await pulse.request('revoke', { grant: result.grant });
      return page(response, 403, { message: denied });
    }
    response.cookie(sessionCookie, result.grant, options);
    const openEntries = entryReviewDirectory && (destination === 'entries' || !allowed(verified?.profile));
    response.redirect(303, openEntries ? '/entries' : '/');
  }));

  app.post('/api/sign-out', route(async (request, response) => {
    if (request.get('origin') !== publicUrl.origin) return response.sendStatus(403);
    const grant = readCookie(request, sessionCookie);
    if (configured && isProof(grant)) await pulse.request('revoke', { grant });
    response.clearCookie(sessionCookie, options);
    response.redirect(303, pulseOrigin.origin + '/');
  }));
}
