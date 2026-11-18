import express from 'express';
import { createApp } from '../../server.mjs';
import { registerMasterRecords } from '../masters/records-routes.mjs';
import { recordMasters } from '../masters/records-fields.mjs';
import { registerLocalSession } from './session.mjs';

export function createLocalWorkspace(db) {
  const app = express();
  app.disable('x-powered-by');
  registerLocalSession(app);
  registerMasterRecords(app, { db, getActor: request => request.dieselActor, enabledMasters: recordMasters });
  app.get('/', (request, response, next) => {
    const { master } = request.query;
    if (!master) return response.redirect(302, '/records');
    if (!recordMasters.includes(master)) return next();
    const target = '/records?master=' + master;
    const newItem = master === 'item-master' && request.dieselActor.canEditMasters;
    return response.redirect(302, newItem ? target + '&new=1' : target);
  });
  app.use(createApp({ env: { DIESEL_ACCESS_MODE: 'guest' } }));
  return app;
}
