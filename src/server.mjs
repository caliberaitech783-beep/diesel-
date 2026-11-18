import express from 'express';
import { fileURLToPath, pathToFileURL } from 'node:url';
import manifest from '../package.json' with { type: 'json' };
import { registerSignIn } from './features/sign-in/routes.mjs';

export function createApp({ env = process.env, fetcher = fetch } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use((_request, response, next) => {
    response.set({
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; style-src 'self'; script-src 'self'; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    });
    next();
  });
  app.get('/healthz', (_request, response) => {
    response.json({ status: 'ok', commit: manifest.releaseCommit ?? null });
  });
  app.use('/masters/assets', express.static(fileURLToPath(new URL('./features/masters/assets/', import.meta.url))));
  registerSignIn(app, { env, fetcher });
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 3000);
  createApp().listen(port, '0.0.0.0', () => console.log(`Diesel listening on port ${port}`));
}
