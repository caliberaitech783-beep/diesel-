import { fileURLToPath } from 'node:url';
import { createPulseClient, isProof, newProof, sameProof } from './pulse-client.mjs';
import { signInPage } from './page.mjs';

const styles = fileURLToPath(new URL('./sign-in.css', import.meta.url));
const unavailable = 'Pulse sign-in is temporarily unavailable. Please try again.';
const expired = 'Your sign-in expired. Please sign in again.';
const readCookie = (request, name) => (request.get('cookie') || '').split(';')
  .map(entry => entry.trim()).find(entry => entry.startsWith(`${name}=`))?.slice(name.length + 1) || '';

export function registerSignIn(app, { env, fetcher }) {
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
  const pulse = createPulseClient({
    origin: new URL(env.PULSE_ORIGIN || 'https://pulse.cmll.in'),
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

  app.get('/sign-in.css', (_request, response) => response.sendFile(styles));
  app.get('/', route(async (request, response) => {
    const grant = readCookie(request, sessionCookie);
    if (!isProof(grant)) return page(response, 200);
    const result = configured && await pulse.request('validate', { grant });
    if (result?.profile?.login) return page(response, 200, { profile: result.profile });
    response.clearCookie(sessionCookie, options);
    page(response, 401, { message: expired });
  }));

  app.get('/api/sign-in/start', route(async (_request, response) => {
    if (!configured) return page(response, 503, { message: unavailable });
    const state = newProof();
    const verifier = newProof();
    response.cookie(stateCookie, `${state}.${verifier}`, { ...options, maxAge: 600_000 });
    response.redirect(303, pulse.authorizationUrl(state, verifier));
  }));

  app.get('/api/sign-in/callback', route(async (request, response) => {
    if (!configured) return page(response, 503, { message: unavailable });
    const { code, state } = request.query;
    const [expectedState, verifier] = readCookie(request, stateCookie).split('.');
    if (!isProof(code) || !isProof(verifier) || !sameProof(state, expectedState)) {
      return page(response, 400, { message: 'This sign-in request did not match your browser. Try again.' });
    }
    response.clearCookie(stateCookie, options);
    const result = await pulse.request('exchange', { code, state, verifier });
    if (!isProof(result?.grant)) return page(response, 401, { message: expired });
    response.cookie(sessionCookie, result.grant, options);
    response.redirect(303, '/');
  }));

  app.post('/api/sign-out', route(async (request, response) => {
    if (request.get('origin') !== publicUrl.origin && request.get('sec-fetch-site') !== 'same-origin') {
      return response.sendStatus(403);
    }
    const grant = readCookie(request, sessionCookie);
    response.clearCookie(sessionCookie, options);
    if (configured && isProof(grant)) await pulse.request('revoke', { grant });
    response.redirect(303, '/');
  }));
}
