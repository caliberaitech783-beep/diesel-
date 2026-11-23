import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import test from 'node:test';
import { openDieselDatabase } from '../../data/database.mjs';
import { createLocalWorkspace } from '../local-workspace/app.mjs';
import { createEntryStore } from './entry-store.mjs';
import { businessDay } from './entry-rules.mjs';
import { roleKey, review } from './review-masters.mjs';

const maker={id:'maker',site:'Jayant',profile:roleKey('Site In-charge')};
const input={type:'E1',rev:0,day:businessDay(),action:'Save indent',data:{litres:100,requiredBy:3}};

test('Save indent validates, numbers and persists a saved request without approving or posting it',t=>{
  const db=openDieselDatabase(':memory:');t.after(()=>db.close());
  const store=createEntryStore(db),id=randomUUID(),token=randomUUID();
  const doc=store.write(id,maker,{...input,token});
  assert.equal(doc.status,'Saved');
  assert.match(doc.number,/^CMLL\/JOC\/IND\/\d{2}-\d{2}\/001$/);
  assert.deepEqual(doc.result.approvals,[]);
  assert.equal(doc.result.telegramAllowed,false);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM entry_review_moves').get().n,0);
  assert.deepEqual(store.write(id,maker,{...input,token}),doc);
  assert.throws(()=>store.write(id,maker,{...input,data:{litres:200,requiredBy:3}}),/changed/);
  assert.throws(()=>store.write(id,{...maker,id:'other'},{...input,rev:doc.rev}),/original maker/);
  assert.throws(()=>store.write(id,{...maker,site:'Sasti'},{...input,rev:doc.rev}),/unavailable/);
  const updated=store.write(id,maker,{...input,rev:doc.rev,data:{litres:120,requiredBy:2}});
  assert.equal(updated.number,doc.number);
  assert.equal(updated.data.litres,120);
  assert.equal(updated.status,'Saved');
  assert.throws(()=>store.write(randomUUID(),{id:'buyer',site:'Jayant',profile:roleKey('Procurement Executive')},{
    type:'E2',rev:0,day:input.day,action:'Submit',data:{indent:id,type:'Bulk',supplier:review.supplier,
      depot:review.depot,basis:'Delivered',kl:0.1,terms:'Advance'},
  }),/posted E1/);
  assert.throws(()=>store.write(randomUUID(),maker,{...input,data:{litres:0,requiredBy:2}}),/positive/);
  assert.throws(()=>store.write(randomUUID(),maker,{...input,data:{litres:120,requiredBy:1.5}}),/whole number/);
  assert.throws(()=>store.write(randomUUID(),{...maker,profile:roleKey('Procurement Executive')},{...input,type:'E2'}),/only available/);
  const next=store.write(randomUUID(),maker,{...input,data:{...input.data,reason:'Operational demand'}});
  assert.match(next.number,/\/002$/);
});

test('the original maker can save an earlier pending indent without losing its number or history',t=>{
  const db=openDieselDatabase(':memory:');t.after(()=>db.close());
  const store=createEntryStore(db);
  const pending=store.write(randomUUID(),maker,{...input,action:'Submit'});
  assert.equal(pending.status,'Awaiting approval');
  const saved=store.write(pending.id,maker,{...input,rev:pending.rev});
  assert.equal(saved.number,pending.number);
  assert.equal(saved.status,'Saved');
  assert.deepEqual(store.history(saved.id).map(row=>row.action),['Submit','Save indent']);
});

test('the indent screen switches site at the top and saves without showing approval controls',async t=>{
  const db=openDieselDatabase(':memory:');
  const server=createLocalWorkspace(db).listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();});
  const origin='http://127.0.0.1:'+server.address().port;
  const role=roleKey('Site In-charge'),site='Dudhichua East OC';
  const switcher=await fetch(origin+'/workspace/role',{method:'POST',redirect:'manual',headers:{Origin:origin},
    body:new URLSearchParams({role,site,returnTo:'/entries/new/E1',indentSite:'1'})});
  assert.equal(switcher.status,303);
  const cookie=switcher.headers.getSetCookie()[0].split(';')[0];
  const headers={cookie,Origin:origin,'Content-Type':'application/json'};
  assert.equal(switcher.headers.get('location'),'/entries/new/E1?site='+encodeURIComponent(site));
  const html=await (await fetch(origin+switcher.headers.get('location'),{headers})).text();
  assert.ok(html.indexOf('id="indent-site-switch"')<html.indexOf('<h1>Create diesel indent</h1>'));
  assert.equal((html.match(/id="indent-site-switch"/g)||[]).length,1);
  assert.match(html,/value="Dudhichua East OC" selected/);
  assert.match(html,/value="Save indent"/);
  assert.doesNotMatch(html,/Use site|value="Submit"|Review role|My approvals/);
  assert.match(html,/<details class="indent-secondary"><summary>Site stock<\/summary>/);
  const id=html.match(/id="entry-form" data-id="([a-f0-9-]+)"/)[1];
  assert.match(html,/Indent number<input type="text" readonly value=""/);
  assert.equal(createEntryStore(db).list(site).length,0);
  const missing=await fetch(origin+'/entries/record/'+id,{method:'POST',headers,
    body:JSON.stringify({...input,actor:site+'-'+role})});
  assert.equal(missing.status,422);
  const invalid=await fetch(origin+'/entries/record/'+id,{method:'POST',headers,
    body:JSON.stringify({...input,site,actor:site+'-'+role,data:{litres:0,requiredBy:2}})});
  assert.equal(invalid.status,422);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM entry_review_numbers').get().n,0);
  const response=await fetch(origin+'/entries/record/'+id,{method:'POST',headers,
    body:JSON.stringify({...input,site,actor:site+'-'+role})});
  assert.equal(response.status,200);
  assert.equal((await response.json()).status,'Saved');
  const saved=await (await fetch(origin+'/entries/record/'+id,{headers})).text();
  assert.match(saved,/value="CMLL\/DEOC\/IND\/\d{2}-\d{2}\/001"/);
  assert.match(saved,/>Saved<\/span>/);
  assert.match(saved,/value="Dudhichua East OC" selected/);
  assert.doesNotMatch(saved,/HSN code/);
  assert.doesNotMatch(saved,/Awaiting approval|value="Approve"|Review as|Review via Telegram/);
  assert.doesNotMatch(saved,/<summary>History<\/summary>|<h2>History<\/h2>/);
  assert.equal(createEntryStore(db).history(id).length,1);
  const register=await (await fetch(origin+'/entries/type/E1?status=Saved',{headers})).text();
  assert.match(register,/CMLL\/DEOC\/IND\/\d{2}-\d{2}\/001/);
  const approvals=await (await fetch(origin+'/entries/approvals',{headers})).text();
  assert.doesNotMatch(approvals,new RegExp(id));
});
