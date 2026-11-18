import express from 'express';
import { fileURLToPath, pathToFileURL } from 'node:url';
import manifest from '../package.json' with { type: 'json' };
import { openItemSubmissions } from './features/masters/item-submissions.mjs';
import { registerItemFileAssets } from './features/masters/item-file-assets.mjs';
import { registerSignIn } from './features/sign-in/routes.mjs';

export function createApp({ env = process.env, fetcher = fetch, itemSubmissions } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use((_request, response, next) => {
    response.set({
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    });
    next();
  });
  app.get('/healthz', (_request, response) => {
    response.json({ status: 'ok', commit: manifest.releaseCommit ?? null, ...(itemSubmissions ? { itemMaster: 'ready' } : {}) });
  });
  app.use('/masters/assets', express.static(fileURLToPath(new URL('./features/masters/assets/', import.meta.url))));
  app.use('/theme/assets', express.static(fileURLToPath(new URL('./features/theme/assets/', import.meta.url))));
  registerItemFileAssets(app);
  registerSignIn(app, { env, fetcher, itemSubmissions });
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 3000);
  let itemSubmissions;
  if (process.env.WEBSITE_SITE_NAME && process.env.WEBSITES_ENABLE_APP_SERVICE_STORAGE?.toLowerCase() !== 'false') {
    try {
      itemSubmissions = await openItemSubmissions('/home/data/diesel-item-submissions');
    } catch (error) {
      console.error('Could not open Diesel Item Master storage:', error.code);
    }
  }
  createApp({ itemSubmissions }).listen(port, '0.0.0.0', () => console.log(`Diesel listening on port ${port}`));
}
