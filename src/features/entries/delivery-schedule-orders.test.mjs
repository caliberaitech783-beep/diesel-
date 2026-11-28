import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { deliveryScheduleOrders, deliveryScheduleSelection } from './delivery-schedule-orders.mjs';
import { roleKey, review } from './review-masters.mjs';
import { openDieselDatabase } from '../../data/database.mjs';
import { createLocalWorkspace } from '../local-workspace/app.mjs';
import { createEntryStore } from './entry-store.mjs';
import { businessDay } from './entry-rules.mjs';

const location='CMPL Madhya Pradesh', day=businessDay(), buyer=roleKey('Procurement Executive');
const actor={id:'buyer',site:'Jayant',profile:buyer,assignments:[{site:'Jayant',profile:buyer},{site:'Dudhichua OC',profile:buyer}]};
const po=(id,site,status='Posted')=>({id,type:'E2',site,status,day,rev:1,number:'PO-'+id,data:{},result:{litres:500}});

test('Delivery Schedule lists POs across permitted sites under the location without exposing other sites',()=>{
  const rows=[po('jay','Jayant'),po('dudh','Dudhichua OC'),po('sasti','Sasti'),po('secret','Dudhichua East OC'),po('pending','Jayant','Awaiting approval')];
  const choices=deliveryScheduleOrders(actor,rows,{location,day});
  assert.deepEqual(new Set(choices.map(row=>row.id)),new Set(['jay','dudh','pending']));
  assert.equal(choices.find(row=>row.id==='pending').selectable,false);
  assert.equal(choices.find(row=>row.id==='dudh').litres,500);
  assert.equal(deliveryScheduleSelection(actor,rows,{po:'dudh',location,day}).site,'Dudhichua OC');
  assert.throws(()=>deliveryScheduleSelection(actor,rows,{po:'secret',location,day}),/permitted site/);
  assert.throws(()=>deliveryScheduleSelection(actor,rows,{po:'dudh',location:'CMPL Nagpur',day}),/selected location/);
  assert.throws(()=>deliveryScheduleSelection(actor,rows,{po:'pending',location,day}),/awaiting approval/);
  const allocated=[...rows,{id:'schedule',type:'E4',site:'Jayant',status:'Posted',data:{po:'jay'},result:{litres:500}}];
  assert.equal(deliveryScheduleOrders(actor,allocated,{location,day}).find(row=>row.id==='jay').selectable,false);
  assert.throws(()=>deliveryScheduleSelection(actor,allocated,{po:'jay',location,day}),/fully scheduled/);
  assert.throws(()=>deliveryScheduleSelection(actor,rows,{po:'dudh',location,day,savedSite:'Jayant'}),/own site/);
});

test('the location picker API and save support a PO at another site under that location without an address',async t=>{
  const db=openDieselDatabase(':memory:'), store=createEntryStore(db);
  const account=(site,role)=>({site,profile:roleKey(role),id:site+'-'+roleKey(role)});
  const makePo=(site,litres,approved=true)=>{
    const indent=store.write(randomUUID(),account(site,'Site In-charge'),{type:'E1',action:'Save indent',day,rev:0,data:{litres,requiredBy:0,reason:review.reasons[0]}});
    store.approveIndent(indent.id,{sanctioned:litres,by:'Approver'});
    let order=store.write(randomUUID(),account(site,'Procurement Executive'),{type:'E2',action:'Submit',day,rev:0,
      data:{indent:indent.id,type:'Bulk',supplier:review.supplier,depot:review.depot,basis:'Delivered',kl:litres/1000,terms:'Credit'}});
    while(approved&&order.status==='Awaiting approval') order=store.write(order.id,account(site,order.result.approvals[order.stage]),{action:'Approve',rev:order.rev});
    return order;
  };
  const jay=makePo('Jayant',500), dudh=makePo('Dudhichua OC',750), sasti=makePo('Sasti',300), pending=makePo('Jayant',100,false);
  const server=createLocalWorkspace(db).listen(0,'127.0.0.1'); await once(server,'listening');
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();});
  const origin='http://127.0.0.1:'+server.address().port;
  const signIn=await fetch(origin+'/workspace/role',{method:'POST',redirect:'manual',headers:{Origin:origin},
    body:new URLSearchParams({role:buyer,site:'Jayant',returnTo:'/entries/new/E4'})});
  const cookie=signIn.headers.get('set-cookie').split(';')[0];
  const get=path=>fetch(origin+path,{headers:{Cookie:cookie}});
  const form=await (await get('/entries/new/E4')).text();
  assert.match(form,/List of Purchase Orders/);
  assert.match(form,/<th>PO No\.<\/th><th>PO Date<\/th><th>Diesel Qty<\/th>/);
  assert.doesNotMatch(form,/Delivery Address|name="deliveryAddress"/);
  const choices=await (await get('/entries/delivery-schedule/orders.json?'+new URLSearchParams({location,day}))).json();
  assert.deepEqual(new Set(choices.map(row=>row.id)),new Set([jay.id,dudh.id,pending.id]));
  assert.equal(choices.find(row=>row.id===dudh.id).litres,750);
  assert.equal(choices.find(row=>row.id===pending.id).selectable,false);
  const write=(id,poId,litres,chosenLocation=location)=>fetch(origin+'/entries/record/'+id,{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},
    body:JSON.stringify({actor:'Jayant-'+buyer,type:'E4',action:'Submit',day,rev:0,data:{po:poId,location:chosenLocation,litres,
      deliveryDate:day,deliveryLocation:'Dudhichua OC',item:review.item,vehicleNo:'MH34BZ4428',transporter:'SANDEEP GASOLENES'}})});
  assert.equal((await write(randomUUID(),sasti.id,300)).status,422,'a PO from another location is rejected');
  assert.equal((await write(randomUUID(),pending.id,100)).status,422,'unapproved POs cannot be scheduled');
  assert.equal((await write(randomUUID(),dudh.id,751)).status,422,'existing PO balance validation still applies');
  const id=randomUUID(), saved=await write(id,dudh.id,750);
  assert.equal(saved.status,200,await saved.clone().text());
  const record=store.read(id,'Dudhichua OC');
  assert.equal(record.data.litres,750); assert.equal(record.data.location,location);
  assert.equal(record.data.deliveryAddress,undefined);
  assert.match(record.number,/^CMLL\/DOC\/DS\/\d{2}-\d{2}\/001$/);
  const nextCookie=saved.headers.get('set-cookie').split(';')[0], result=await saved.json();
  const reopened=await fetch(origin+result.url,{headers:{Cookie:nextCookie}});
  assert.equal(reopened.status,200); assert.doesNotMatch(await reopened.text(),/Delivery Address/);
  assert.equal(store.read(jay.id,'Jayant').number,jay.number,'the PO itself is unchanged');
});
