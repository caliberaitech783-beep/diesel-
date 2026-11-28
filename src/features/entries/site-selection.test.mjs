import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createApp } from '../../server.mjs';
import { openDieselDatabase } from '../../data/database.mjs';
import { createLocalWorkspace } from '../local-workspace/app.mjs';
import { page } from './entry-shell.mjs';
import { siteContextChoice,siteContextOptions } from './site-selection.mjs';
import { canChooseRole } from './entry-access.mjs';
import { roleKey } from './review-masters.mjs';
import { detailPage } from './entry-page.mjs';
import { createEntryStore } from './entry-store.mjs';
import { byId } from './catalog.mjs';

const grant=(site,role)=>({site,role,profile:roleKey(role),key:site+'.'+roleKey(role)});
const assignments=[grant('Jayant','Site In-charge'),grant('Jayant','Project Manager'),grant('Sasti','Procurement Executive')];
const actor={id:'operator',site:'Jayant',profile:roleKey('Site In-charge'),assignments,selectedSite:''};
const selector=html=>html.match(/<details class="context">[\s\S]*?<\/details>/)?.[0];

test('the top-right selector is site-only and never chooses the first grant automatically',()=>{
  for(const list of [assignments,[assignments[0]]]) {
    const html=selector(page('Workspace',{...actor,assignments:list},'workspace','/entries/workspace',''));
    assert.match(html,/>Select a site<\/summary>/);
    assert.match(html,/<option value="" selected>Select a site<\/option>/);
    assert.doesNotMatch(html,/Review role|Assigned site and role|role-name|name="(?:role|assignment)"|value="Jayant" selected/);
    assert.equal((html.match(/value="Jayant"/g)||[]).length,1,'each site appears once even with multiple roles');
  }
  const selected=selector(page('Workspace',{...actor,selectedSite:'Jayant'},'workspace','/entries/workspace',''));
  assert.match(selected,/value="Jayant" selected/);
});

test('site-only changes select an existing assignment and cannot invent a new post or site',()=>{
  assert.deepEqual(siteContextOptions(actor).map(row=>row.site),['Jayant','Sasti']);
  assert.deepEqual(siteContextChoice(actor,{siteOnly:'1',site:'Jayant',role:roleKey('Director / CMD')}),{site:'Jayant',role:roleKey('Site In-charge')});
  const other=siteContextChoice(actor,{siteOnly:'1',site:'Sasti',role:roleKey('Director / CMD')});
  assert.deepEqual(other,{site:'Sasti',role:roleKey('Procurement Executive')});
  assert.equal(canChooseRole(actor,other.site,other.role),true);
  const denied=siteContextChoice(actor,{siteOnly:'1',site:'Unknown site'});
  assert.equal(canChooseRole(actor,denied.site,denied.role),false);
});

test('new purchase-order place fields stay blank while a saved order retains its site',t=>{
  const db=openDieselDatabase(':memory:');t.after(()=>db.close());
  const buyer={...actor,assignments:undefined,profile:roleKey('Procurement Executive')};
  const doc=createEntryStore(db).fresh('E2',buyer);
  const html=detailPage(buyer,doc,[],[],null,byId.E2);
  for(const control of ['data-order-location','data-order-site']) {
    const field=html.match(new RegExp(`<select ${control}[^>]*>[\\s\\S]*?<\\/select>`))[0];
    assert.doesNotMatch(field,/<option[^>]+ selected/);
  }
  const saved=detailPage(buyer,{...doc,rev:1},[],[],null,byId.E2);
  assert.match(saved,/Site<input type="text" readonly tabindex="-1"[^>]*value="Jayant OC"/);
});

test('an initial workspace is unfiltered and a site-only choice persists without a role picker',async t=>{
  const db=openDieselDatabase(':memory:'),app=createLocalWorkspace(db);
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();});
  const origin='http://127.0.0.1:'+server.address().port;
  const get=(path,cookie)=>fetch(origin+path,{redirect:'manual',headers:cookie?{Cookie:cookie}:{}});
  const initial=await (await get('/entries/dashboard')).text();
  assert.match(selector(initial),/<option value="" selected>Select a site<\/option>/);
  assert.match(initial,/<select name="site"><option value="" selected>Select a site<\/option><option value="all">All sites<\/option>/);
  const switchSite=site=>fetch(origin+'/workspace/role',{method:'POST',redirect:'manual',headers:{Origin:origin},
    body:new URLSearchParams({siteOnly:'1',site,returnTo:'/entries/workspace'})});
  assert.equal((await switchSite('')).status,400);
  assert.equal((await switchSite('Unknown site')).status,400);
  const chosen=await switchSite('Sasti');assert.equal(chosen.status,303);
  const cookie=chosen.headers.get('set-cookie').split(';')[0];
  const selected=await (await get('/entries/workspace',cookie)).text();
  assert.match(selector(selected),/<option value="Sasti" selected>/);
  assert.doesNotMatch(selector(selected),/Review role|name="role"/);
});

test('hosted site-only changes enforce verified grants and remember no site before an explicit choice',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'diesel-site-selection-'));
  const profile={login:'operator',dieselEntryAccess:assignments.map(({site,role})=>({site,role}))};
  const app=createApp({env:{DIESEL_ACCESS_MODE:'pulse',DIESEL_PUBLIC_ORIGIN:'https://diesel.test',DIESEL_SSO_CLIENT_SECRET:'s'.repeat(43),
    DIESEL_ENTRY_ACCESS_MODE:'assigned-pilot'},entryReviewDirectory:directory,fetcher:async()=>Response.json({profile})});
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});});
  const origin='http://127.0.0.1:'+server.address().port,cookie='__Host-diesel_session='+'g'.repeat(43);
  const initial=await (await fetch(origin+'/entries/workspace',{headers:{Cookie:cookie}})).text();
  assert.match(selector(initial),/<option value="" selected>/);
  const change=site=>fetch(origin+'/workspace/role',{method:'POST',redirect:'manual',headers:{Origin:'https://diesel.test',Cookie:cookie},
    body:new URLSearchParams({siteOnly:'1',site,role:roleKey('Director / CMD'),returnTo:'/entries/workspace'})});
  assert.equal((await change('Unknown site')).status,403);
  const chosen=await change('Sasti');assert.equal(chosen.status,303);
  const context=chosen.headers.get('set-cookie').split(';')[0];
  assert.match(decodeURIComponent(context),/Sasti\.entry-4/);
  const selected=await (await fetch(origin+'/entries/workspace',{headers:{Cookie:cookie+'; '+context}})).text();
  assert.match(selector(selected),/<option value="Sasti" selected>/);
  assert.doesNotMatch(selector(selected),/name="role"|Procurement Executive|Director/);
});
