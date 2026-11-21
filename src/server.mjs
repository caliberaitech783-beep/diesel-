import express from 'express';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import manifest from '../package.json' with { type: 'json' };
import { openItemSubmissions } from './features/masters/item-submissions.mjs';
import { registerItemFileAssets } from './features/masters/item-file-assets.mjs';
import { registerSignIn } from './features/sign-in/routes.mjs';
import { openHostedMasterDatabase } from './features/masters/hosted-master-storage.mjs';
import { approvedLocationDirectory } from './features/masters/records.mjs';

export function createApp({ env = process.env, fetcher = fetch, itemSubmissions, entryReviewDirectory,
  siteMasterDb = undefined, sharedMasterDb, pulseMasterClock } = {}) {
  const masterSource = env.DIESEL_SITE_MASTER_DB ? siteMasterDb : siteMasterDb ?? sharedMasterDb;
  const app = express();
  app.disable('x-powered-by');
  app.use((_request, response, next) => {
    response.set({
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-src 'self'; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    });
    next();
  });
  app.get('/healthz', (_request, response) => {
    response.json({ status: 'ok', commit: manifest.releaseCommit ?? null,
      ...(itemSubmissions || sharedMasterDb ? { itemMaster: 'ready', masters: 'ready' } : {}),
      ...(sharedMasterDb ? { sharedMasters: 'ready' } : {}),
      ...(env.WEBSITE_SITE_NAME || entryReviewDirectory ? {
        openingStock: (env.WEBSITE_SITE_NAME || env.DIESEL_ENTRY_ACCESS_MODE==='site-stock')
          && entryReviewDirectory && masterSource && approvedLocationDirectory(masterSource).length ? 'ready' : 'setup',
        // Names the missing step without exposing any record.
        entrySetup: !entryReviewDirectory || !masterSource ? 'approved master data cannot be read'
          : approvedLocationDirectory(masterSource).length ? 'ready'
            : 'no approved Location Master record in ' + (env.DIESEL_SITE_MASTER_DB ? 'the separate site master file' : 'shared Master Data'),
        ...(app.locals.entryLocationRun ? { entryLocationRun: app.locals.entryLocationRun } : {}),
      } : {}) });
  });
  app.use('/masters/assets', express.static(fileURLToPath(new URL('./features/masters/assets/', import.meta.url))));
  app.use('/master-data/assets', express.static(fileURLToPath(new URL('./features/master-data/assets/', import.meta.url))));
  app.use('/theme/assets', express.static(fileURLToPath(new URL('./features/theme/assets/', import.meta.url))));
  registerItemFileAssets(app);
  registerSignIn(app, { env, fetcher, itemSubmissions, entryReviewDirectory, siteMasterDb:masterSource, sharedMasterDb, pulseMasterClock });
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 3000);
  let itemSubmissions, sharedMasterDb;
  if (process.env.WEBSITE_SITE_NAME && process.env.WEBSITES_ENABLE_APP_SERVICE_STORAGE?.toLowerCase() !== 'false') {
    try {
      itemSubmissions = await openItemSubmissions('/home/data/diesel-item-submissions');
    } catch (error) {
      console.error('Could not open Diesel Item Master storage:', error.code);
    }
    try {
      sharedMasterDb = openHostedMasterDatabase('/home/data/diesel-master-data/masters.sqlite');
    } catch (error) {
      console.error('Could not open shared Diesel Master Data storage:', error.code ?? error.message);
    }
  }
  const entryReviewDirectory = itemSubmissions || sharedMasterDb ? '/home/data/diesel-entry-review' : undefined;
  let siteMasterDb;
  if (entryReviewDirectory && process.env.DIESEL_SITE_MASTER_DB) {
    let source;
    try {
      const path = process.env.DIESEL_SITE_MASTER_DB;
      source = new DatabaseSync(path,{readOnly:true});
      source.prepare('SELECT m.approved_revision, m.approved_site_key, m.status, h.snapshot FROM master_records m JOIN master_history h ON h.record_id=m.id LIMIT 1').get();
      siteMasterDb = source;
    } catch(error) {
      source?.close();
      console.error('Diesel site stock setup incomplete:',error.code??error.message);
    }
  }
  const server=createApp({ itemSubmissions, sharedMasterDb, entryReviewDirectory, siteMasterDb })
    .listen(port, '0.0.0.0', () => console.log(`Diesel listening on port ${port}`));
  server.once('close',()=>{ siteMasterDb?.close(); sharedMasterDb?.close(); });
}
