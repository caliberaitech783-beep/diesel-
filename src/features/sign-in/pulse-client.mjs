import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const newProof = () => randomBytes(32).toString('base64url');
export const isProof = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
export const challengeFor = verifier => createHash('sha256').update(verifier).digest('base64url');
export const sameProof = (first, second) => isProof(first) && isProof(second)
  && timingSafeEqual(Buffer.from(first), Buffer.from(second));

export function createPulseClient({ origin, secret, fetcher }) {
  if (origin.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(origin.hostname)) {
    throw new Error('PULSE_ORIGIN must use HTTPS.');
  }

  return {
    authorizationUrl(state, verifier) {
      // Pulse's interactive handoff can display and resume required onboarding.
      const url = new URL('/', origin);
      url.searchParams.set('dieselSignIn', '1');
      url.searchParams.set('state', state);
      url.searchParams.set('code_challenge', challengeFor(verifier));
      return url.toString();
    },
    async request(operation, payload) {
      const response = await fetcher(new URL(`/api/diesel-sso/${operation}`, origin), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
        body: JSON.stringify(payload),
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
      });
      if ([401, 403, 428].includes(response.status)) return null;
      if (response.status === 204) return {};
      if (!response.ok) throw new Error('Pulse sign-in service unavailable.');
      return response.json();
    },
  };
}
