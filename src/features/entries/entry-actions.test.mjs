import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { openDieselDatabase } from '../../data/database.mjs';
import { createLocalWorkspace } from '../local-workspace/app.mjs';
import { entryCreationSites, newEntryPath } from './entry-creation.mjs';
import { entryStartPage } from './entry-actions.mjs';
import { byId } from './catalog.mjs';
import { roleKey } from './review-masters.mjs';

test('New entry uses only verified maker grants without choosing a site by default', () => {
  const actor={id:'manager',site:'Jayant',selectedSite:'',profile:roleKey('Project Manager'),
    assignments:[{site:'Jayant',profile:roleKey('Project Manager')},{site:'Sasti',profile:roleKey('Site In-charge')}]};
  assert.equal(newEntryPath(actor,byId.E1),'/entries/start/E1');
  assert.deepEqual(entryCreationSites(actor,byId.E1).map(row=>row.site),['Sasti']);
  const html=entryStartPage(actor,byId.E1);
  const form=html.match(/<form[^>]*class="entry-start-form">[\s\S]*?<\/form>/)[0];
  assert.match(form,/<option value="" selected>Select a site<\/option>/);
  assert.doesNotMatch(form,/<option value="Jayant"/);
  assert.deepEqual(entryCreationSites(actor,byId.E2),[]);
});

test('indent New entry and Approval stay available on new forms and after successive saves',async t=>{
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
    assert.match(html,/class="entry-action-menu"/);
    assert.match(html,/>New entry<\/a>/);
    assert.match(html,/href="\/indent-approvals">Approval<\/a>/);
  };
  options(await (await get('/entries/type/E1')).text());
  const ids=[];
  for(let i=0;i<2;i++){
    const html=await (await get('/entries/new/E1?site=Jayant')).text();
    options(html);
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
  assert.equal((await get('/entries/start/E2')).status,200);
  assert.equal((await get('/entries/new/E2')).status,403,'the start option does not bypass the maker role');
});
