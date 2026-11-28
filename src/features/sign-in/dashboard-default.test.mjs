import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createApp } from '../../server.mjs';
import { openHostedMasterDatabase } from '../masters/hosted-master-storage.mjs';

test('ordinary and master-only Pulse users land on the available shared Dashboard after sign-in',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'diesel-dashboard-home-'));
  const db=openHostedMasterDatabase(join(directory,'masters.sqlite'));
  const profiles={g:{login:'ordinary',name:'Ordinary user'},m:{login:'master-viewer',name:'Master viewer',
    dieselMasterAccess:[{site:'Jayant',role:'Master Viewer'}]}};
  let who='g';
  const app=createApp({env:{WEBSITE_SITE_NAME:'diesel',DIESEL_PUBLIC_ORIGIN:'https://diesel.test',DIESEL_SSO_CLIENT_SECRET:'s'.repeat(43)},
    sharedMasterDb:db,entryReviewDirectory:join(directory,'entries'),
    fetcher:async(url,options)=>url.pathname.endsWith('/exchange')?Response.json({grant:who.repeat(43)}):
      Response.json({profile:profiles[JSON.parse(options.body).grant[0]]})});
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();await rm(directory,{recursive:true,force:true});});
  const base='http://127.0.0.1:'+server.address().port;
  const get=(path,cookie)=>fetch(base+path,{redirect:'manual',headers:cookie?{Cookie:cookie}:{}});
  for(who of Object.keys(profiles)) {
    const start=await get('/api/sign-in/start');
    const state=new URL(start.headers.get('location')).searchParams.get('state');
    const finish=await get('/api/sign-in/callback?'+new URLSearchParams({state,code:'c'.repeat(43)}),start.headers.get('set-cookie').split(';')[0]);
    assert.equal(finish.status,303);
    assert.equal(finish.headers.get('location'),'/entries/dashboard');
    assert.ok(finish.headers.getSetCookie().some(value=>value.startsWith('__Host-diesel_stock_assignment=;')),'plain sign-in clears an earlier site choice');
    const cookie=finish.headers.getSetCookie().find(value=>value.startsWith('__Host-diesel_session=')).split(';')[0];
    assert.equal((await get('/',cookie)).headers.get('location'),'/entries/dashboard');
    const dashboard=await get('/entries/dashboard',cookie);
    assert.equal(dashboard.status,200);
    assert.match(await dashboard.text(),/<h1>Diesel Dashboard<\/h1>/);
  }
});
