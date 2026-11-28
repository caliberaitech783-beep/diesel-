import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { openDieselDatabase } from '../../data/database.mjs';
import { createLocalWorkspace } from '../local-workspace/app.mjs';
import { entryCreationContext } from './entry-creation.mjs';
import { newEntryLink } from './entry-actions.mjs';
import { byId } from './catalog.mjs';
import { roleKey } from './review-masters.mjs';

test('New entry uses only verified maker grants without choosing a site by default', () => {
  const actor={id:'manager',site:'Jayant',selectedSite:'',profile:roleKey('Project Manager'),
    assignments:[{site:'Jayant',profile:roleKey('Project Manager')},{site:'Sasti',profile:roleKey('Site In-charge')}]};
  assert.deepEqual(entryCreationContext(actor,byId.E1),{site:'Sasti',role:roleKey('Site In-charge')});
  assert.match(newEntryLink(actor,byId.E1),/method="post" action="\/entries\/start\/E1"/);
  assert.doesNotMatch(newEntryLink(actor,byId.E1),/<select/);
  assert.equal(entryCreationContext(actor,byId.E2),null);
});

test('indent keeps only New entry in its heading on new forms and after successive saves',async t=>{
  const db=openDieselDatabase(':memory:');
  const server=createLocalWorkspace(db).listen(0,'127.0.0.1');
  await once(server,'listening');
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();});
  const origin='http://127.0.0.1:'+server.address().port;
  const switched=await fetch(origin+'/workspace/role',{method:'POST',redirect:'manual',headers:{Origin:origin},
    body:new URLSearchParams({role:roleKey('Site In-charge'),site:'Jayant',returnTo:'/entries/workspace'})});
  const cookie=switched.headers.get('set-cookie').split(';')[0];
  const get=path=>fetch(origin+path,{redirect:'manual',headers:{Cookie:cookie}});
  const options=html=>{
    assert.match(html,/>New entry<\/a>/);
    assert.doesNotMatch(html,/class="entry-action-menu"|href="\/indent-approvals"/);
  };
  options(await (await get('/entries/type/E1')).text());
  const ids=[];
  for(let i=0;i<2;i++){
    const html=await (await get('/entries/new/E1?site=Jayant')).text();
    options(html);
    assert.match(html,/<div class="entry-record-heading">[\s\S]*?<div class="entry-actions"><a class="primary"[^>]*>New entry<\/a><\/div><\/div>/);
    const id=html.match(/id="entry-form"[^>]*data-id="([^"]+)"/)[1];
    ids.push(id);
    const actor=html.match(/<body[^>]*data-actor="([^"]+)"/)[1];
    const day=html.match(/name="day"[^>]*value="([^"]+)"/)[1];
    const saved=await fetch(origin+'/entries/record/'+id,{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},
      body:JSON.stringify({actor,type:'E1',action:'Save indent',site:'Jayant',day,rev:0,data:{litres:1000,requiredBy:0,reason:'Operational demand'}})});
    assert.equal(saved.status,200,await saved.text());
    options(await (await get('/entries/record/'+id)).text());
  }
  assert.notEqual(ids[0],ids[1]);
  assert.equal((await get('/entries/start/E2')).status,303);
  assert.equal((await get('/entries/new/E2')).status,403,'the start option does not bypass the maker role');
  const opened=await fetch(origin+'/entries/start/E2',{method:'POST',redirect:'manual',headers:{Origin:origin}});
  assert.equal(opened.status,303);
  assert.equal(opened.headers.get('location'),'/entries/new/E2');
  const nextCookie=opened.headers.get('set-cookie').split(';')[0];
  const nextHtml=await (await fetch(origin+opened.headers.get('location'),{headers:{Cookie:nextCookie}})).text();
  assert.match(nextHtml,/id="entry-form"[^>]*data-type="E2"/);
  assert.doesNotMatch(nextHtml,/Choose a site to start|entry-start-form/);
  assert.match(nextHtml,/<select data-order-site[^>]*><option value="">Select site<\/option>/,'no site is selected by clicking New entry');
});
