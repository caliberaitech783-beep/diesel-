import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createApp } from '../../server.mjs';
import { openDieselDatabase } from '../../data/database.mjs';
import { createMasterStore } from '../masters/records.mjs';
import { syncPulseProjects } from '../masters/pulse-projects.mjs';

test('hosted Entry checks Pulse for every site, file, export and role action and separates review accounts', async t=>{
  const dir=await mkdtemp(join(tmpdir(),'diesel-hosted-review-'));
  const origin='https://diesel.test';
  const app=createApp({entryReviewDirectory:dir,env:{WEBSITE_SITE_NAME:'diesel',DIESEL_PUBLIC_ORIGIN:origin,
    DIESEL_SSO_CLIENT_SECRET:'s'.repeat(43),DIESEL_ALLOWED_PULSE_LOGINS:'alice,bob'},
    fetcher:async(_url,options)=>Response.json({profile:{login:{a:'alice',b:'bob',c:'excluded'}[JSON.parse(options.body).grant[0]]}})});
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true});});
  const base='http://127.0.0.1:'+server.address().port;
  const request=(path,who,opts={})=>fetch(base+path,{redirect:'manual',...opts,headers:{
    ...(who?{cookie:'__Host-diesel_session='+who.repeat(43)}:{}),...opts.headers}});
  for (const path of ['/entries','/entries/file/missing','/entries/export.csv']) {
    assert.equal((await request(path)).status,303);
    assert.equal((await request(path,'c',{headers:{Accept:'application/json'}})).status,401);
  }
  const get=await request('/entries','a');assert.equal(get.status,200);
  const html=await get.text();assert.match(html,/Personal review · sample data/);
  assert.match(html,/href="\/entries\/opening-stock"/);
  assert.match(await (await request('/entries/opening-stock','a')).text(),/Site stock is awaiting setup/);
  assert.equal((await request('/entries/opening-stock','a',{method:'POST',headers:{Origin:origin},
    body:new URLSearchParams({item:'example',measuredAt:'2026-11-18T06:00'})})).status,404);
  const offlineScope=html.match(/data-offline-scope="([a-f0-9]{64})"/)?.[1];
  assert.ok(offlineScope);
  assert.doesNotMatch(await (await request('/entries','b')).text(),new RegExp(offlineScope));
  const path=html.match(/href="(\/entries\/record\/[a-f0-9-]+)"/)[1];
  assert.match(await (await request(path,'a')).text(),/Purchase order/);
  assert.equal((await request(path,'b')).status,404);
  assert.equal((await request('/entries/offline-worker.js','a')).status,404);
  const role={method:'POST',headers:{Origin:origin},body:new URLSearchParams({role:'entry-2',site:'Jayant',returnTo:path})};
  assert.equal((await request('/workspace/role','a',{...role,headers:{Origin:'https://other.test'}})).status,403);
  const switched=await request('/workspace/role','a',role);assert.equal(switched.status,303);
  const roleCookie=switched.headers.get('set-cookie').split(';')[0];
  const otherHeaders={Origin:origin,'Content-Type':'application/json',cookie:'__Host-diesel_session='+'b'.repeat(43)+'; '+roleCookie};
  const rejected=await request(path,'b',{method:'POST',headers:otherHeaders,
    body:JSON.stringify({action:'Approve',rev:1,actor:'Jayant-entry-2',offlineScope})});
  assert.equal(rejected.status,403);
  const headers={Origin:origin,'Content-Type':'application/json',cookie:'__Host-diesel_session='+'a'.repeat(43)+'; '+roleCookie};
  const approved=await request(path,'a',{method:'POST',headers,body:JSON.stringify({action:'Approve',rev:1,actor:'Jayant-entry-2',offlineScope})});
  assert.equal((await approved.json()).status,'Posted');
});

test('hosted site stock requires trusted site assignments and approved masters',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'diesel-site-stock-'));
  const origin='https://diesel.test', masterDb=openDieselDatabase(':memory:');
  syncPulseProjects(masterDb,[{name:'Test client',sites:['Jayant OC']}]);
  const masters = createMasterStore(masterDb,['location-master']);
  const location = masters.create('location-master',{site:'Jayant',values:{'Location Code':'TEST',
    'Business day cut-off':'06:00','Site In-charge':'Test operator','Project Manager':'Test manager',
    'Receipt scenario allowed':'UG tank'}},{id:'maker'});
  masters.changeStatus(location.master,location.id,location.revision,'approve',{id:'checker'});
  const env={WEBSITE_SITE_NAME:'diesel',DIESEL_PUBLIC_ORIGIN:origin,DIESEL_SSO_CLIENT_SECRET:'s'.repeat(43),
    DIESEL_ENTRY_ACCESS_MODE:'site-stock',DIESEL_ALLOWED_PULSE_LOGINS:'legacy'};
  const profiles={ s:{login:'site-maker',dieselEntryAccess:[{site:'Jayant OC',role:'Site In-charge'}]},
    b:{login:'bowser',dieselEntryAccess:[{site:'Jayant',role:'Bowser operator'}]}, l:{login:'legacy'},
    u:{login:'unapproved',dieselEntryAccess:[{site:'Sasti',role:'Project Manager'}]} };
  const app=createApp({env,entryReviewDirectory:dir,siteMasterDb:masterDb,
    fetcher:async(_url,options)=>Response.json({profile:profiles[JSON.parse(options.body).grant[0]]})});
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));masterDb.close();await rm(dir,{recursive:true,force:true});});
  const address='http://127.0.0.1:'+server.address().port;
  const request=(path,who,body)=>fetch(address+path,{redirect:'manual',method:body?'POST':'GET',
    headers:{Origin:origin,...(who?{cookie:'__Host-diesel_session='+who.repeat(43)}:{})},body});
  assert.equal((await (await request('/healthz')).json()).openingStock,'ready');
  assert.equal((await request('/entries/opening-stock')).status,303);
  assert.equal((await request('/entries/opening-stock','l')).status,403);
  assert.equal((await request('/entries/opening-stock','u')).status,403);
  assert.match(await(await request('/entries/opening-stock','s')).text(),/Approve an Item Master record/);
  assert.equal((await request('/entries/new/E11','b')).headers.get('location'),'/entries/opening-stock');
  assert.equal((await request('/entries/type/E2','s')).status,200);
  assert.equal((await request('/workspace/role','b',new URLSearchParams({site:'Sasti',role:'entry-0'}))).status,403);
  assert.equal((await request('/entries/opening-stock','b',new URLSearchParams({item:'anything'}))).status,403);
});
