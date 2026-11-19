import { fileURLToPath } from 'node:url';
import { openDieselDatabase } from '../src/data/database.mjs';
import { createLocalWorkspace } from '../src/features/local-workspace/app.mjs';
import { createApp } from '../src/server.mjs';

const preview = process.argv.includes('--preview');
const siteStock = process.argv.includes('--site-stock');
const port = siteStock ? 4323 : preview ? 4313 : Number(process.env.PORT || 3000);
const localWorkspace = preview || siteStock || (process.env.DIESEL_ACCESS_MODE ?? 'guest') === 'guest';
const localFile = name => fileURLToPath(new URL('../.local-diesel/'+name, import.meta.url));
const db = localWorkspace ? openDieselDatabase(process.env.DIESEL_LOCAL_MASTER_DB || localFile('items.sqlite')) : null;
const siteEntryDb = siteStock ? openDieselDatabase(process.env.DIESEL_LOCAL_SITE_ENTRY_DB || localFile('site-entries.sqlite')) : undefined;
const app = db ? createLocalWorkspace(db,{siteEntryDb}) : createApp();
const server = app.listen(port, '127.0.0.1', () => {
  console.log(`Diesel listening at http://127.0.0.1:${server.address().port}`);
});
function stop() {
  server.close(() => { siteEntryDb?.close(); db?.close(); process.exit(0); });
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
