import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { openDieselDatabase } from '../../data/database.mjs';
import { createEntryStore } from './entry-store.mjs';
import { review, roleKey } from './review-masters.mjs';
import { byId } from './catalog.mjs';
import { businessDay, dayBefore } from './entry-rules.mjs';
import { createLocalApproval } from './local-approval.mjs';
import { closeJournalCsv } from './accounting-export.mjs';

// These tests date entries across months and years, so the three-day limit on entry dates is lifted for this file.
process.env.DIESEL_ENTRY_DATE_WINDOW_DAYS='off';

const photo=[{name:'test.png',base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='}];
const day=businessDay();
function actor(role,site='Jayant') { return {site,profile:roleKey(role),id:site+'-'+roleKey(role),name:role}; }
function setup(t) {
  const db=openDieselDatabase(':memory:');t.after(()=>db.close());
  const store=createEntryStore(db);
  function submit(type,data,role=byId[type].maker,when=day) {
    return store.write(randomUUID(),actor(role),{type,rev:0,day:when,action:'Submit',data});
  }
  function act(doc,action,role,extra={},site=doc.site) {
    return store.write(doc.id,actor(role,site),{action,rev:doc.rev,...extra});
  }
  function approve(doc) {
    while(doc.status==='Awaiting approval') {
      const role=doc.result.approvals[doc.stage];
      if (role==='Site In-charge' && doc.maker===actor(role).id) {
        doc=store.write(doc.id,{site:doc.site,id:doc.site+'-entry-deputy',profile:'entry-deputy'},{action:'Approve',rev:doc.rev});
      } else doc=act(doc,'Approve',role);
    }
    return doc;
  }
  return {db,store,submit,act,approve};
}
function purchase(w,when=day) {
  const indent=w.approve(w.submit('E1',{litres:2000,requiredBy:0},undefined,when));
  const po=w.approve(w.submit('E2',{indent:indent.id,type:'Bulk',supplier:review.supplier,depot:review.depot,basis:'Ex-depot',transporter:review.transporter,kl:1,terms:'Advance'},undefined,when));
  assert.equal(po.result.value,90000);
  assert.throws(()=>w.submit('E2',{...po.data,kl:1.1},undefined,when),/indent balance/);
  const payment=w.approve(w.submit('E3',{po:po.id,amount:po.result.value},undefined,when));
  assert.equal(payment.status,'Awaiting Treasury');
  w.act(payment,'Confirm UTR','Treasury',{utr:'TEST-UTR-001',paymentDate:when});
  return po;
}
function gate(w,po,scenario,when=day) {
  return w.submit('E5',{po:po.id,scenario,transporter:review.transporter,truck:'TEST101',driver:'Test driver',mobile:'9000000000',
    fitness:'2099-12-31',licence:'2099-12-31',invoice:'TEST01',invoiceDate:when,litres:1000,eway:'TEST',seals:'S01',intact:'Yes',sealPhotos:photo,billPhoto:photo},undefined,when);
}
function inspect(w,g,extra={},when=day) {
  return w.approve(w.submit('E6',{gate:g.id,density:830,temperature:25,instrument:review.instrument,decision:'Accept',evidence:photo,...extra},undefined,when));
}
test('bulk receipt flows from indent through payment, inspection, generated GRN, bill and freight recovery',t=>{
  const w=setup(t),po=purchase(w),g=gate(w,po,'UG tank');
  inspect(w,g,{tank:review.tank.label,before:20,after:29.8,decision:'Accept with shortage',reason:review.reasons[1]});
  const grns=w.store.list('Jayant').filter(r=>r.type==='E7');
  assert.equal(grns.length,1);const grn=grns[0];
  assert.equal(grn.result.accepted,980);assert.equal(grn.result.shortage,20);
  const bill=w.approve(w.submit('E8',{grn:grn.id,bill:'B101',billDate:day,litres:1000,rate:90000,vat:0}));
  assert.equal(bill.result.amount,88200);
  const debit=w.store.list('Jayant').find(r=>r.type==='E9');
  const submitted=w.store.write(debit.id,actor('Accounts Executive'),{rev:debit.rev,type:'E9',action:'Submit',day,data:{grn:grn.id,bill:'F101',billDate:day}});
  const freight=w.approve(submitted);assert.equal(freight.result.debit,1800);assert.equal(freight.result.freight,1176);
  assert.throws(()=>gate(w,po,'UG tank'),/already exists/);
});
test('two tanker loads create one GRN on empty confirmation without crediting the bowser twice',t=>{
  const w=setup(t),po=purchase(w),g=gate(w,po,'Direct to bowsers');inspect(w,g);
  assert.equal(w.store.list('Jayant').filter(r=>r.type==='E7').length,0);
  for (const [start,end] of [[0,400],[400,1000]]) w.submit('E10B',{gate:g.id,bowser:review.bowser.label,start,end,evidence:photo});
  assert.throws(()=>w.submit('E10B',{gate:g.id,bowser:review.bowser.label,start:1000,end:1100,evidence:photo}),/balance/);
  w.approve(w.submit('E10C',{gate:g.id,empty:'Yes',evidence:photo}));
  const grn=w.store.list('Jayant').find(r=>r.type==='E7');assert.equal(grn.result.accepted,1000);
  const count=w.approve(w.submit('E15',{dip:20,bowserCount:1500}));
  assert.equal(count.result.bowserVariance,0);
});
test('stock transfers, issues, two-source recovery, and destination confirmation respect site and review rules',t=>{
  const w=setup(t);
  w.submit('E10A',{tank:review.tank.label,bowser:review.bowser.label,before:20,after:19,start:0,end:100,evidence:photo});
  w.submit('E11',{bowser:review.bowser.label,vehicle:'Hired 02',driver:review.driver,reading:10,start:0,end:100,evidence:photo});
  w.approve(w.submit('E14',{pump:review.pump,vehicle:'Hired 02',slip:'R1',slipDate:day,litres:20,rate:90,total:1800,reading:5,evidence:photo}));
  const recovery=w.approve(w.submit('E13',{party:review.party,fromDate:day,toDate:day,basis:'Fixed rate',method:'Deduct from hire bill'}));
  assert.equal(recovery.result.litres,120);assert.equal(recovery.result.amount,10800);
  assert.throws(()=>w.submit('E13',recovery.data),/No unrecovered/);
  const transfer=w.approve(w.submit('E12',{from:review.bowser.label,to:review.tank.label,bowser:review.bowser.label,driver:review.driver,sent:50,evidence:photo}));
  assert.equal(transfer.status,'In transit');
  assert.throws(()=>w.act(transfer,'Confirm receipt','Site Store',{received:49,evidence:photo}),/receiving site/);
  const receipt=w.act(transfer,'Confirm receipt','Site Store',{received:49,evidence:photo,reason:review.reasons[2]},'Sasti');
  assert.equal(receipt.status,'Receipt review');
  assert.equal(w.act(receipt,'Approve transfer variance','Project Manager',{},'Sasti').status,'Posted');
});
test('entry changes are attributed, retry-safe, scope-limited and corrected with a new version',t=>{
  const w=setup(t),id=randomUUID(),maker=actor('Site In-charge');
  const input={type:'E1',action:'Submit',day,rev:0,data:{litres:100,requiredBy:0},token:randomUUID()};
  const submitted=w.store.write(id,maker,input);
  assert.deepEqual(w.store.write(id,maker,input),submitted);
  assert.throws(()=>w.act(submitted,'Approve','Site In-charge'),/another reviewer/);
  assert.throws(()=>w.store.read(id,'Sasti'),/unavailable/);
  const returned=w.act(submitted,'Return','Project Manager',{reason:'Check litres'});
  const resubmitted=w.store.write(id,maker,{...input,rev:returned.rev,token:randomUUID()});
  const posted=w.approve(resubmitted);
  const correction=w.approve(w.submit('E16',{target:posted.id,field:'litres',value:'150',reason:review.reasons[0],evidence:photo},'Site In-charge'));
  assert.equal(w.store.read(posted.id,'Jayant').status,'Superseded');
  assert.equal(w.store.read(correction.result.replacement,'Jayant').result.litres,150);
  assert.ok(w.store.history(posted.id).length>=5);
});
test('the sample purchase, receipt and fuel issue reconcile through month close and a balanced journal export',t=>{
  const w=setup(t),end=dayBefore(day.slice(0,7)+'-01'),month=end.slice(0,7);
  assert.throws(()=>w.submit('E17',{month}),/every daily count/);
  const first = month+'-01';
  const po = purchase(w,first);
  const arrival = gate(w,po,'UG tank',first);
  inspect(w,arrival,{tank:review.tank.label,before:20,after:30},first);
  const grn = w.store.list('Jayant').find(row=>row.type==='E7');
  w.approve(w.submit('E8',{grn:grn.id,bill:'MB-01',billDate:first,litres:1000,rate:90000,vat:0},undefined,first));
  w.approve(w.submit('E9',{grn:grn.id,bill:'MF-01',billDate:first},undefined,first));
  w.submit('E11',{bowser:review.bowser.label,vehicle:'Fleet 01',driver:review.driver,reading:10,start:0,end:100,evidence:photo},undefined,first);
  for(let date=1;date<=Number(end.slice(-2));date++) {
    const when=month+'-'+String(date).padStart(2,'0');
    const count = w.approve(w.submit('E15',{dip:30,bowserCount:400},undefined,when));
    assert.equal(count.result.tankVariance,0);
    assert.equal(count.result.bowserVariance,0);
  }
  const closed=w.approve(w.submit('E17',{month}));
  assert.equal(closed.result.litres,3400);
  assert.equal(closed.result.closingValue,307165.71);
  assert.deepEqual(closed.result.journal,[
    {account:'Fleet operations',debit:9034.29,credit:0},
    {account:'Review diesel clearing',debit:0,credit:9034.29},
  ]);
  assert.match(closeJournalCsv(closed),/"Fleet operations","9034.29","0.00","3400"/);
  assert.throws(()=>w.submit('E1',{litres:50,requiredBy:0},undefined,end),/month is locked/);
});

test('local SMS approval enforces expiry, attempt lockout, scope and single-use across channels',t=>{
  const w=setup(t),inbox=createLocalApproval(w.db,w.store);
  const d=w.submit('E1',{litres:100,requiredBy:0});
  const reviewer=actor('Project Manager'),now=Date.now();
  assert.throws(()=>inbox.issue(d.id,actor('Site In-charge'),now),/reviewer/);
  const first=inbox.issue(d.id,reviewer,now);
  assert.match(first,/^\d{6}$/);
  assert.throws(()=>inbox.confirm(d.id,reviewer,first,now+300001),/valid local/);
  inbox.issue(d.id,reviewer,now+300002);
  for(let i=0;i<3;i++)assert.throws(()=>inbox.confirm(d.id,reviewer,'invalid',now+300003),/Incorrect/);
  assert.throws(()=>inbox.issue(d.id,reviewer,now+300004),/15 minutes/);
  const code=inbox.issue(d.id,reviewer,now+1201000);
  const approved=inbox.confirm(d.id,reviewer,code,now+1201001);
  assert.equal(approved.stage,1);
  assert.throws(()=>inbox.confirm(d.id,reviewer,code,now+1201002),/reviewer/);
  assert.equal(w.store.history(d.id).at(-1).action,'Approve · Local Telegram / OTP');
});
