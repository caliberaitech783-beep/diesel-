import { fileURLToPath } from 'node:url';
import { openDieselDatabase } from '../src/data/database.mjs';
import { createLocalWorkspace } from '../src/features/local-workspace/app.mjs';
import { createApp } from '../src/server.mjs';

const preview = process.argv.includes('--preview');
const port = preview ? 4313 : Number(process.env.PORT || 3000);
const localWorkspace = preview || (process.env.DIESEL_ACCESS_MODE ?? 'guest') === 'guest';
const db = localWorkspace ? openDieselDatabase(fileURLToPath(new URL('../.local-diesel/items.sqlite', import.meta.url))) : null;
const app = db ? createLocalWorkspace(db) : createApp();
const server = app.listen(port, '127.0.0.1', () => {
  console.log(`Diesel listening at http://127.0.0.1:${server.address().port}`);
});
function stop() {
  server.close(() => { db?.close(); process.exit(0); });
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
