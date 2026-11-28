import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { read,utils } from 'xlsx';
import { openDieselDatabase } from '../../data/database.mjs';
import { createLocalWorkspace } from '../local-workspace/app.mjs';
import { createEntryStore } from './entry-store.mjs';
import { filterRegister,registerFilters } from './entry-register.mjs';
import { businessDay } from './entry-rules.mjs';
import { roleKey } from './review-masters.mjs';

test('indent registers include saved and earlier submitted indents while excluding drafts and keeping other entry workflows',()=>{
  const rows=['Draft','Saved','Awaiting approval','Posted','Returned','Superseded'].map((status,index)=>({
    id:String(index),type:'E1',number:'IND-'+index,status,day:'2026-11-23',data:{},result:{},
  }));
  const purchaseDraft={...rows[0],id:'purchase',type:'E2'};
  assert.deepEqual(filterRegister([...rows,purchaseDraft],undefined,registerFilters({})),[...rows.slice(1,4),purchaseDraft]);
  assert.deepEqual(filterRegister(rows,'E1',registerFilters({status:'Draft'})),[]);
  assert.deepEqual(filterRegister(rows,'E1',registerFilters({q:'IND-0'})),[]);
});

test('saved-only indent records, totals and exports hide drafts until Save indent completes',async t=>{
  const db=openDieselDatabase(':memory:');
  const server=createLocalWorkspace(db).listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();});
  const origin='http://127.0.0.1:'+server.address().port,role=roleKey('Site In-charge');
  const switched=await fetch(origin+'/workspace/role',{method:'POST',redirect:'manual',headers:{Origin:origin},
    body:new URLSearchParams({role,site:'Jayant',returnTo:'/entries/type/E1'})});
  const cookie=switched.headers.getSetCookie()[0].split(';')[0];
  const headers={cookie,Origin:origin,'Content-Type':'application/json'};
  const actor={site:'Jayant',id:'Jayant-'+role,profile:role},store=createEntryStore(db),day=businessDay();
  const draft=store.write(randomUUID(),actor,{type:'E1',day,action:'Save draft',rev:0,data:{litres:100,requiredBy:2}});
  const saved=store.write(randomUUID(),actor,{type:'E1',day,action:'Save indent',rev:0,data:{litres:200,requiredBy:2}});
  for(const path of ['/entries/type/E1','/entries/type/E1?status=Draft','/entries','/entries?status=Draft']) {
    const html=await (await fetch(origin+path,{headers})).text();
    assert.doesNotMatch(html,new RegExp(draft.id));
    assert.doesNotMatch(html,new RegExp(draft.number));
    if(path.startsWith('/entries/type/E1')) {
      assert.match(html,new RegExp(saved.number));
      assert.match(html,/Records <small>1<\/small>/);
      assert.doesNotMatch(html,/<option value="Draft"|<option value="Returned"/);
    }
    if(path==='/entries') assert.match(html,/<h1>All entries<\/h1>/);
  }
  const csv=await (await fetch(origin+'/entries/export.csv?type=E1',{headers})).text();
  assert.ok(csv.includes(saved.number));assert.ok(!csv.includes(draft.number));
  const excel=await fetch(origin+'/entries/export.xlsx?type=E1',{headers});
  const workbook=read(Buffer.from(await excel.arrayBuffer()));
  assert.deepEqual(utils.sheet_to_json(workbook.Sheets['Diesel Entries'],{range:4}).map(row=>row.Document),[saved.number]);
  const reopened=await fetch(origin+'/entries/record/'+draft.id,{headers});
  assert.equal(reopened.status,200);
  const response=await fetch(origin+'/entries/record/'+draft.id,{method:'POST',headers,body:JSON.stringify({
    actor:actor.id,type:'E1',site:actor.site,day,action:'Save indent',rev:draft.rev,data:{...draft.data,reason:'Operational demand'},
  })});
  assert.equal(response.status,200,await response.clone().text());
  const html=await (await fetch(origin+'/entries/type/E1',{headers})).text();
  assert.match(html,new RegExp(draft.number));assert.match(html,/Records <small>2<\/small>/);
});
