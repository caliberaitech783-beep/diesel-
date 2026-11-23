import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { openDieselDatabase } from '../../data/database.mjs';
import { createEntryStore } from './entry-store.mjs';
import { review, roleKey } from './review-masters.mjs';
import { byId, correctableFields, correctionTypes } from './catalog.mjs';
import { businessDay, dayBefore } from './entry-rules.mjs';
import { entryAlerts } from './entry-alerts.mjs';
import { entryPolicy } from './entry-policy.mjs';

const photo=[{name:'test.png',base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='}];
const day=businessDay();
const actor=(role,site='Jayant')=>({site,profile:roleKey(role),id:site+'-'+roleKey(role),name:role});
function setup(t) {
  const db=openDieselDatabase(':memory:');t.after(()=>db.close());
  const store=createEntryStore(db);
  const submit=(type,data,role=byId[type].maker,when=day)=>store.write(randomUUID(),actor(role),{type,rev:0,day:when,action:'Submit',data});
  const act=(doc,action,role,extra={})=>store.write(doc.id,actor(role,doc.site),{action,rev:doc.rev,...extra});
  function approve(doc) {
    while(doc.status==='Awaiting approval') {
      const role=doc.result.approvals[doc.stage];
      doc=role==='Site In-charge'&&doc.maker===actor(role).id
        ? store.write(doc.id,{site:doc.site,id:doc.site+'-entry-deputy',profile:'entry-deputy'},{action:'Approve',rev:doc.rev})
        : act(doc,'Approve',role);
    }
    return doc;
  }
  return {store,submit,act,approve};
}
function receive(w,inspection) {
  const indent=w.approve(w.submit('E1',{litres:2000,requiredBy:0}));
  const po=w.approve(w.submit('E2',{indent:indent.id,type:'Bulk',supplier:review.supplier,depot:review.depot,basis:'Ex-depot',transporter:review.transporter,kl:1,terms:'Advance'}));
  w.act(w.approve(w.submit('E3',{po:po.id,amount:po.result.value})),'Confirm UTR','Treasury',{utr:'CTRL-UTR-'+randomUUID().slice(0,6),paymentDate:day});
  const gate=w.submit('E5',{po:po.id,scenario:'UG tank',transporter:review.transporter,truck:'CTRL101',driver:'Test driver',mobile:'9000000000',
    fitness:'2099-12-31',licence:'2099-12-31',invoice:'CTRL01',invoiceDate:day,litres:1000,eway:'CTRL',seals:'S01',intact:'Yes',sealPhotos:photo,billPhoto:photo});
  return { indent, po, gate, inspection:w.submit('E6',{gate:gate.id,density:830,temperature:25,instrument:review.instrument,tank:review.tank.label,evidence:photo,...inspection}) };
}

test('a second indent while one is open needs a reason and names the open indent', t => {
  const w=setup(t);
  const first=w.submit('E1',{litres:500,requiredBy:0});
  assert.equal(first.status,'Awaiting approval');
  assert.throws(()=>w.submit('E1',{litres:400,requiredBy:0}),new RegExp('Indent '+first.number+' is still open'));
  const second=w.submit('E1',{litres:400,requiredBy:0,reason:'Operational demand'});
  assert.equal(second.result.otherOpenIndents,1);
  assert.equal(second.result.openIndentNumbers,first.number);
});

test('part of a load can be rejected: only accepted litres are stock, and the rest of the gap is shortage', t => {
  const w=setup(t);
  assert.throws(()=>receive(w,{before:20,after:29.8,decision:'Accept part, reject part',reason:review.reasons[1]}),/Enter the rejected litres/);
  const w2=setup(t);
  const { inspection }=receive(w2,{before:20,after:29,decision:'Accept part, reject part',rejected:80,reason:review.reasons[1]});
  assert.deepEqual([inspection.result.accepted,inspection.result.rejected,inspection.result.shortage],[900,80,20]);
  assert.deepEqual(inspection.result.approvals,['Site In-charge','Project Manager']);
  w2.approve(inspection);
  const grn=w2.store.list('Jayant').find(row=>row.type==='E7');
  assert.deepEqual([grn.result.accepted,grn.result.rejected,grn.result.shortage],[900,80,20]);
  const debit=w2.store.list('Jayant').find(row=>row.type==='E9');
  assert.equal(debit?.result.debit ?? w2.approve(w2.submit('E9',{grn:grn.id,bill:'FR-1',billDate:day})).result.debit, 1800, 'the debit note covers the 20 L shortage at ₹90,000/KL, not the rejected litres');
  const w3=setup(t);
  assert.throws(()=>receive(w3,{before:20,after:29.8,decision:'Accept with shortage',rejected:5,reason:review.reasons[1]}),/apply only to Accept part, reject part/);
});

test('corrections cover every entry type and field, and never need less approval than the original', t => {
  assert.ok(['E2','E5','E6','E10A','E11','E12','E15'].every(type=>correctionTypes.includes(type)));
  assert.ok(!['E3','E7','E16','E17'].some(type=>correctionTypes.includes(type)));
  assert.ok(correctableFields('E11').some(field=>field.key==='end') && !correctableFields('E11').some(field=>field.key==='vehicle'));
  const field=byId.E16.fields.find(item=>item.key==='field');
  assert.equal(field.optionLabels.get('requiredBy'),'Required by (days)');
  const w=setup(t);
  const indent=w.approve(w.submit('E1',{litres:300,requiredBy:0}));
  const dated=w.submit('E16',{target:indent.id,field:'requiredBy',value:'3',reason:review.reasons[4],evidence:photo},'Site In-charge');
  assert.throws(()=>w.submit('E16',{target:indent.id,field:'bill',value:'X',reason:review.reasons[4],evidence:photo},'Site In-charge'),/field that the original diesel indent has/);
  assert.match(String(dated.result.approvals),/^Site In-charge$/);
  assert.equal(dated.result.field,'Required by (days)');
  const po=w.approve(w.submit('E2',{indent:indent.id,type:'Bulk',supplier:review.supplier,depot:review.depot,basis:'Ex-depot',transporter:review.transporter,kl:0.3,terms:'Advance'}));
  const poCorrection=w.submit('E16',{target:po.id,field:'kl',value:'0.2',reason:review.reasons[4],evidence:photo},'Procurement Executive');
  assert.deepEqual(poCorrection.result.approvals,[...po.result.approvals,'Head – Accounts']);
});

test('a second override of any kind for the same vehicle within a week also goes to the Project Manager', async () => {
  const { stockEntries } = await import('./stock-entries.mjs');
  const data={vehicle:'F-1',bowser:'B-1',start:60,end:90,reading:102,reason:'Repeat'};
  const vehicles=[{code:'F-1',vehicleType:'Excavator',capacity:100,meterType:'Hour meter',owner:'Own',costCentre:'C-1'}];
  const context=previous=>({doc:{day:'2026-11-19',readingAt:'2026-11-19T02:30:00.000Z',vehicleChecksVersion:1},
    siteConfig:{vehicles,routeStandards:[]},posted:()=>previous,limits:{repeatHours:6,meterJump:24}});
  const earlier=(result,day='2026-11-18')=>({day,readingAt:'2026-11-19T00:30:00.000Z',data:{vehicle:'F-1',bowser:'B-1',end:60,reading:100},result});
  assert.deepEqual(stockEntries.E11(data,context([earlier({meterJump:true})])).approvals,['Site In-charge','Project Manager'],'an earlier meter jump counts');
  assert.deepEqual(stockEntries.E11(data,context([earlier({aboveStandard:true})])).approvals,['Site In-charge','Project Manager'],'an earlier above-standard fill counts');
  assert.deepEqual(stockEntries.E11(data,context([earlier({})])).approvals,['Site In-charge'],'a first override stays with the Site In-charge');
  assert.deepEqual(stockEntries.E11(data,context([earlier({meterJump:true},'2026-11-12')])).approvals,['Site In-charge'],'an override more than a week ago does not count');
});

test('a post-sale discount stays outstanding on the bill until its credit notes add up to it', t => {
  const saved=review.postSaleDiscount; review.postSaleDiscount=500; t.after(()=>{ review.postSaleDiscount=saved; });
  const w=setup(t);
  const { inspection }=receive(w,{before:20,after:29.8,decision:'Accept with shortage',reason:review.reasons[1]});
  w.approve(inspection);
  const grn=w.store.list('Jayant').find(row=>row.type==='E7');
  let bill=w.approve(w.submit('E8',{grn:grn.id,bill:'B-CN',billDate:day,litres:1000,rate:90000,vat:0}));
  assert.equal(bill.result.expectedPostSaleDiscount,490);
  const old=Date.parse(day+'T00:00:00Z')+31*86400000;
  const alerts=entryAlerts(w.store.list('Jayant'),actor('Accounts Executive'),entryPolicy(),old);
  assert.deepEqual(alerts.filter(alert=>alert.label==='Credit note pending').map(alert=>alert.detail),['₹490.00 post-sale discount awaiting credit note']);
  assert.equal(entryAlerts(w.store.list('Jayant'),actor('Accounts Executive'),entryPolicy(),old-10*86400000).filter(alert=>alert.label==='Credit note pending').length,0);
  assert.throws(()=>w.act(bill,'Record credit note','Site Store',{creditNote:'CN-1',creditAmount:100,creditDate:day}),/Switch to Accounts/);
  assert.throws(()=>w.act(bill,'Record credit note','Accounts Executive',{creditNote:'CN-1',creditAmount:600,creditDate:day}),/up to the ₹490/);
  bill=w.act(bill,'Record credit note','Accounts Executive',{creditNote:'CN-1',creditAmount:300,creditDate:day});
  assert.deepEqual([bill.result.creditReceived,bill.result.creditPending],[300,190]);
  assert.throws(()=>w.act(bill,'Record credit note','Accounts Executive',{creditNote:'cn-1',creditAmount:100,creditDate:day}),/already recorded/);
  bill=w.act(bill,'Record credit note','Head – Accounts',{creditNote:'CN-2',creditAmount:190,creditDate:day});
  assert.equal(bill.result.creditPending,0);
  assert.throws(()=>w.act(bill,'Record credit note','Accounts Executive',{creditNote:'CN-3',creditAmount:1,creditDate:day}),/No post-sale discount is outstanding/);
  assert.equal(entryAlerts(w.store.list('Jayant'),actor('Accounts Executive'),entryPolicy(),old).filter(alert=>alert.label==='Credit note pending').length,0);
});

test('GPS stamps keep the reading accuracy with the action', t => {
  const {store}=setup(t);
  const save=position=>store.write(randomUUID(),actor('Site In-charge'),{type:'E1',rev:0,day,action:'Save draft',
    data:{litres:1000,requiredBy:0},position});
  const id=save({latitude:23.1,longitude:82.5,accuracy:12.6}).id;
  assert.deepEqual(store.history(id).at(-1).meta.position,{latitude:23.1,longitude:82.5,accuracy:13});
  assert.deepEqual(store.history(save({latitude:23.1,longitude:82.5,accuracy:-4}).id).at(-1).meta.position,{latitude:23.1,longitude:82.5});
});
