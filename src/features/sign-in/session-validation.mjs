import { isProof } from './pulse-client.mjs';

// Reuse a verification within one HTTP request, and once for the page immediately
// following a successful callback. Later requests still check Pulse for revocation.
export function createSessionValidation({ validate, now = Date.now }) {
  const requests = new WeakMap();
  const handoffs = new Map();
  const handoffLifetime = 5000;
  const handoffLimit = 128;

  return {
    verify(request, grant) {
      if (!isProof(grant)) return null;
      if (requests.has(request)) return requests.get(request);
      const handoff = handoffs.get(grant);
      // A write always verifies again, and cannot leave a prior handoff reusable.
      handoffs.delete(grant);
      const result = request.method === 'GET' && handoff?.until > now()
        ? Promise.resolve(handoff.result) : Promise.resolve().then(() => validate(grant));
      requests.set(request, result);
      return result;
    },
    remember(grant, result) {
      if (!isProof(grant) || !result?.profile?.login) return;
      for (const [key, handoff] of handoffs) {
        if (handoff.until <= now()) handoffs.delete(key);
      }
      handoffs.delete(grant);
      if (handoffs.size >= handoffLimit) handoffs.delete(handoffs.keys().next().value);
      handoffs.set(grant, { result, until: now() + handoffLifetime });
    },
    forget(grant) { handoffs.delete(grant); },
  };
}
