import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openDieselDatabase } from '../src/data/database.mjs';
import { syncPulseProjects } from '../src/features/masters/pulse-projects.mjs';

const checkout = process.argv[2];
if (!checkout) throw new Error('Pass the path to your trusted Pulse 1 repository checkout.');
const { REGION_DATA } = await import(pathToFileURL(resolve(checkout, 'region-scope.mjs')).href);
const db = openDieselDatabase(fileURLToPath(new URL('../.local-diesel/items.sqlite', import.meta.url)));
try {
  for (const project of syncPulseProjects(db, REGION_DATA)) console.log(project.name + ' · ' + project.client);
} finally {
  db.close();
}
