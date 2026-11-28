import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { allEntriesPage } from './all-entries-page.mjs';
import { workspacePage } from './workspace-page.mjs';
import { openDieselDatabase } from '../../data/database.mjs';
import { createLocalWorkspace } from '../local-workspace/app.mjs';
import { createEntryStore } from './entry-store.mjs';
import { businessDay } from './entry-rules.mjs';

const actor={id:'maker',site:'Jayant',profile:'entry-0'};
test('All entries uses the Workspace module cards with register links and no creation or site-picker controls',()=>{
  const html=allEntriesPage(actor), workspace=workspacePage(actor);
  const links=view=>[...view.matchAll(/class="ws-card-open" href="([^"]+)"/g)].map(match=>match[1]);
  assert.deepEqual(links(html),links(workspace));
  assert.equal(links(html).length,17);
  assert.match(html,/<h1>All entries<\/h1>/);
  assert.doesNotMatch(html,/class="ws-new"|id="site-context"|details class="context"/);
  const restricted=allEntriesPage({...actor,assignments:[{site:'Jayant',profile:'entry-0',key:'Jayant.entry-0'}]});
  assert.deepEqual(links(restricted),['/entries/type/E1','/entries/type/E2']);
});

test('choosing a module shows its own entries and existing status drill-downs still show records',async t=>{
  const db=openDieselDatabase(':memory:'); createEntryStore(db);
  const day=businessDay(), po={id:randomUUID(),type:'E2',site:'Jayant',day,rev:1,status:'Posted',number:'TEST-PO-001',data:{},result:{litres:500,value:100},stage:0};
  const ds={...po,id:randomUUID(),type:'E4',number:'TEST-DS-001',data:{po:po.id},result:{litres:100}};
  for(const doc of [po,ds]) db.prepare('INSERT INTO entry_review_docs VALUES(?,?)').run(doc.id,JSON.stringify(doc));
  const server=createLocalWorkspace(db).listen(0,'127.0.0.1'); await once(server,'listening');
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();});
  const origin='http://127.0.0.1:'+server.address().port;
  const home=await (await fetch(origin+'/entries')).text();
  assert.match(home,/class="ws-card-open" href="\/entries\/type\/E2"/);
  assert.doesNotMatch(home,/TEST-PO-001|TEST-DS-001/);
  const orders=await (await fetch(origin+'/entries/type/E2')).text();
  assert.match(orders,/TEST-PO-001/); assert.doesNotMatch(orders,/TEST-DS-001/);
  const schedules=await (await fetch(origin+'/entries/type/E4')).text();
  assert.match(schedules,/TEST-DS-001/); assert.doesNotMatch(schedules,/TEST-PO-001/);
  const filtered=await (await fetch(origin+'/entries?status=Posted')).text();
  assert.match(filtered,/TEST-PO-001/); assert.match(filtered,/TEST-DS-001/);
});
