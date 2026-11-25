import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import test from 'node:test';
import { openDieselDatabase } from '../../data/database.mjs';
import { createLocalWorkspace } from '../local-workspace/app.mjs';
import { createMasterStore } from '../masters/records.mjs';
import { masterDefinition } from '../masters/records-fields.mjs';
import { syncPulseProjects } from '../masters/pulse-projects.mjs';
import { businessDay, dayBefore } from './entry-rules.mjs';
import { createEntryStore } from './entry-store.mjs';
import { roleKey } from './review-masters.mjs';
import { siteEntryTypes } from './site-masters.mjs';
import { siteEntryWorkspace } from './site-entry-workspace.mjs';
import { transferKey } from './transfer-destination.mjs';

const proof={name:'meter.png',base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='};
const pdf={name:'fixture.pdf',base64:Buffer.from('%PDF-1.4\n%%EOF').toString('base64')};

test('site Entry reconciles approved opening stock, purchasing and receipts through month-end without mixing the review ledger', async t=>{
  const mastersDb=openDieselDatabase(':memory:'), siteDb=openDieselDatabase(':memory:');
  const server=createLocalWorkspace(mastersDb,{siteEntryDb:siteDb}).listen(0,'127.0.0.1');
  await once(server,'listening');
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));siteDb.close();mastersDb.close();});
  const origin='http://127.0.0.1:'+server.address().port;
  syncPulseProjects(mastersDb,[{ name:'Test Client 1', sites:['Jayant OC'] },{ name:'Test Client 2', sites:['Sasti OC','Majri'] }]);
  const kinds=['item-master','location-master','storage-location-master','cost-centre-vehicle-master','driver-master','account-master',
    'supplier-depot-master','diesel-rate-master','transport-freight-master','measuring-instrument-master','gst-master',
    'document-numbering-master','reason-code-master','shift-master'];
  const masters=createMasterStore(mastersDb,kinds);
  const sample={number:'10',date:'2025-01-01',time:'06:00',email:'test@example.com',file:pdf};
  function master(kind,fields,{approve=true,site='Jayant'}={}) {
    const defaults=Object.fromEntries(masterDefinition(kind,fields).fields.filter(field=>field.required)
      .map(field=>[field.key,field.options?.[0]??sample[field.type]??'Test']));
    const record=masters.create(kind,{site,values:{...defaults,...fields}},{id:'master-maker'});
    if(approve) masters.changeStatus(kind,record.id,record.revision,'approve',{id:'master-checker'});
  }
  master('item-master',{'Item Code':'HSD-A','Item Name':'Site diesel','HSN Code':'00123456','Measuring Unit':'L','Density minimum (kg/m³)':'815','Density maximum (kg/m³)':'845'});
  master('location-master',{'Location Code':'J-01','Receipt scenario allowed':'Both'});
  master('shift-master',{Site:'Jayant','Shift name':'Day shift','Start time':'06:00','End time':'18:00','Business day cut-off':'06:00'});
  master('shift-master',{Site:'Jayant','Shift name':'Night shift','Start time':'18:00','End time':'06:00','Business day cut-off':'06:00'});
  const storage={'Storage type':'UG tank',Location:'J-01','Capacity (L)':'2000','Safe fill level (L)':'1500',
    'Calibration chart (dip-to-litres table, UG tanks)':'cm,litres\n0,0\n20,1000\n40,2000'};
  master('storage-location-master',{...storage,'Storage Loc Code':'T-1','Storage Loc. Name':'Main tank'});
  master('storage-location-master',{...storage,'Storage Loc Code':'T-2','Storage Loc. Name':'Second tank'});
  master('storage-location-master',{...storage,'Storage type':'Bowser','Storage Loc Code':'B-2','Storage Loc. Name':'Site bowser','Home tank':'T-1'});
  master('storage-location-master',{...storage,'Storage Loc Code':'T-3','Storage Loc. Name':'Pending tank'},{approve:false});
  master('cost-centre-vehicle-master',{'Cost Centre Code':'CC-20','Fleet No.':'F-20','Registration No.':'TEST01',Ownership:'Own',
    'Fuel tank capacity (L)':'120','Meter reading at go-live':'200','QR or RFID tag No.':'TAG-20'});
  master('driver-master',{'Employee Code':'D-20','Employee Name':'Site driver'});
  master('item-master',{'Item Code':'HSD-A','Item Name':'Site diesel','Density minimum (kg/m³)':'815','Density maximum (kg/m³)':'845'},{site:'Sasti'});
  master('location-master',{'Location Code':'S-01','Receipt scenario allowed':'Both'},{site:'Sasti'});
  master('storage-location-master',{...storage,Location:'S-01','Storage type':'Bowser','Storage Loc Code':'S-B','Storage Loc. Name':'Receiving bowser'},{site:'Sasti'});
  master('item-master',{'Item Code':'HSD-A','Item Name':'Site diesel','Density minimum (kg/m³)':'815','Density maximum (kg/m³)':'845'},{site:'Majri'});
  master('location-master',{'Location Code':'M-01','Receipt scenario allowed':'Both'},{site:'Majri'});
  master('storage-location-master',{...storage,Location:'M-01','Storage type':'Bowser','Storage Loc Code':'S-B','Storage Loc. Name':'Majri bowser'},{site:'Majri'});
  master('reason-code-master',{Code:'REV',Description:'Correction supported by evidence',
    'Used for (rejection, shortage, variance, correction, override)':'Correction','Evidence required':'Yes'});
  master('account-master',{'A/C Code':'HIRE','A/C Name':'Hire operator','TDS / TCS Applicable':'No',
    'Recovery rate basis (hire parties, contractors)':'Fixed rate 100000'});
  master('cost-centre-vehicle-master',{'Cost Centre Code':'CC-21','Fleet No.':'F-21','Registration No.':'TEST02',Ownership:'Hired',
    'Hire party or contractor':'HIRE','Fuel tank capacity (L)':'120','Meter reading at go-live':'200','QR or RFID tag No.':'TAG-21'});
  const day=businessDay(), last=dayBefore(day.slice(0,7)+'-01');
  const fiscal=date=>{
    const year=Number(date.slice(0,4))-(date.slice(5,7)<'04'?1:0);
    return year+'-'+String(year+1).slice(-2);
  };
  for (const entry of siteEntryTypes) for (const year of new Set([fiscal(day),fiscal(last)])) {
    master('document-numbering-master',{Entry:entry,Prefix:'SITE-'+entry,'Financial year':year,'Next number':'7','Site-wise series (Y/N)':'Yes'});
  }
  for(const code of ['SUP-10','LORRY-1','CLR','EXP']) {
    master('account-master',{'A/C Code':code,'A/C Name':code,'Is Market Petrol Pump':'No','TDS / TCS Applicable':'No','Bank details verified by':'Accounts'});
  }
  master('account-master',{'A/C Code':'PUMP','A/C Name':'Retail pump','Is Market Petrol Pump':'Yes','TDS / TCS Applicable':'No'});
  master('supplier-depot-master',{'Supplier (A/C Code)':'SUP-10','Depot name':'DEP-1'});
  master('diesel-rate-master',{Supplier:'SUP-10',Depot:'DEP-1','Price basis (Ex-depot / Delivered)':'Ex-depot',
    'VAT (%) by state':'0','Basic rate (₹/KL)':'98750','Excise duty (₹/KL)':'0','Effective from':'2020-01-01'});
  master('transport-freight-master',{Transporter:'LORRY-1','From depot':'DEP-1','To site':'J-01',
    'Freight (₹/KL)':'1500','Shortage deduction rate (₹/KL)':'98750','Effective from':'2020-01-01'});
  master('measuring-instrument-master',{'Instrument ID':'DIP-1','Fitted on (tank, bowser)':'T-1',
    'Calibration date':'2020-01-01','Calibration due date':'2099-12-31'});
  master('gst-master',{'GST code':'FREIGHT','Applies to (freight, services)':'Freight','GST rate (%)':'18','Effective from':'2020-01-01'});
  function request(path,cookie,body) {
    return fetch(origin+path,{redirect:'manual',method:body?'POST':'GET',
      headers:{Origin:origin,'Content-Type':body instanceof URLSearchParams?'application/x-www-form-urlencoded':'application/json',...(cookie?{cookie}:{})},
      body:body instanceof URLSearchParams?body:JSON.stringify(body)});
  }
  const profileKey=role=>role==='Deputy Site In-charge'?'entry-deputy':roleKey(role);
  async function signIn(role,site='Jayant') {
    const response=await request('/workspace/role',null,new URLSearchParams({role:profileKey(role),site}));
    assert.equal(response.status,303);
    return response.headers.get('set-cookie').split(';')[0];
  }
  const maker=await signIn('Site In-charge'), checker=await signIn('Project Manager'), other=await signIn('Project Manager','Sasti');
  const opening='/entries/opening-stock';
  const draft=await (await request(opening,maker)).text();
  assert.match(draft,/T-2/);
  assert.doesNotMatch(draft,/Pending tank|UG tank 01/);
  assert.equal((await request('/entries/new/E1',maker)).headers.get('location'),opening);
  assert.equal((await request('/entries/type/E2',maker)).status,200);
  const setup=new URLSearchParams({item:'HSD-A',measuredAt:last+'T07:00',openingRate:'90000',revision:'0'});
  setup.append('code','T-1');setup.append('litres','1100');
  setup.append('code','T-2');setup.append('litres','0');
  assert.equal((await request(opening,maker,setup)).status,422);
  setup.append('code','B-2');setup.append('litres','300');
  assert.equal((await request(opening,maker,setup)).status,303);
  assert.equal((await request(opening+'/approve',maker,new URLSearchParams({revision:'1'}))).status,403);
  assert.equal((await request(opening+'/approve',other,new URLSearchParams({revision:'1'}))).status,409);
  assert.equal((await request(opening+'/approve',checker,new URLSearchParams({revision:'1'}))).status,303);
  assert.equal((await request(opening,maker,setup)).status,409);
  const sastiMaker=await signIn('Site In-charge','Sasti');
  const sastiStore=await signIn('Site Store','Sasti');
  const receivingSetup=new URLSearchParams({item:'HSD-A',measuredAt:last+'T07:00',
    revision:'0',code:'S-B',litres:'0'});
  assert.equal((await request(opening,sastiMaker,receivingSetup)).status,303);
  assert.equal((await request(opening+'/approve',other,new URLSearchParams({revision:'1'}))).status,303);
  assert.equal((await request(opening+'/valuation',sastiMaker,new URLSearchParams({revision:'2',openingRate:'90000'}))).status,303);
  assert.equal((await request(opening+'/valuation/approve',sastiMaker,new URLSearchParams({revision:'3'}))).status,403);
  assert.equal((await request(opening+'/valuation/approve',other,new URLSearchParams({revision:'3'}))).status,303);
  const majri = siteEntryWorkspace(siteDb,mastersDb).opening;
  majri.submit({site:'Majri',id:'majri-maker',profile:roleKey('Site In-charge')},
    {item:'HSD-A',measuredAt:last+'T07:00',revision:0,readings:[{code:'S-B',litres:0}]});
  majri.approve({site:'Majri',id:'majri-reviewer',profile:roleKey('Project Manager')},1);
  const openedIndent=await request('/entries/new/E1?site=Jayant',maker);
  assert.equal(openedIndent.status,200);
  const indent=await openedIndent.text();
  assert.match(indent,/HSD-A · Site diesel/);
  assert.match(indent,/1,400/);
  const store=createEntryStore(siteDb);
  async function submit(type,role,data,when=last) {
    const cookie=await signIn(role), id=randomUUID();
    const submitted=await request('/entries/record/'+id,cookie,{actor:'Jayant-'+roleKey(role),type,day:when,action:'Submit',rev:0,data});
    assert.equal(submitted.status,200,await submitted.text());
    return store.read(id,'Jayant');
  }
  async function action(doc, role, operation='Approve', more={}) {
    const cookie=await signIn(role);
    const response=await request('/entries/record/'+doc.id,cookie,{actor:'Jayant-'+profileKey(role),action:operation,rev:doc.rev,...more});
    assert.equal(response.status,200,await response.text());
    return store.read(doc.id,'Jayant');
  }
  async function approve(doc) {
    while (doc.status==='Awaiting approval') doc=await action(doc,doc.result.approvals[doc.stage]);
    return doc;
  }
  const approvedIndent=await approve(await submit('E1','Site In-charge',{litres:200,requiredBy:0}));
  assert.match(approvedIndent.number,/^CMLL\/JOC\/IND\/\d{2}-\d{2}\/\d{3}$/);
  assert.equal(approvedIndent.indentItem.hsn,'00123456');
  assert.equal(approvedIndent.indentItem.unit,'L');
  assert.doesNotMatch(await (await request('/entries/record/'+approvedIndent.id,maker)).text(),/HSN code|00123456/);
  const order=await approve(await submit('E2','Procurement Executive',{indent:approvedIndent.id,type:'Bulk',supplier:'SUP-10',
    depot:'DEP-1',basis:'Ex-depot',transporter:'LORRY-1',terms:'Advance',kl:0.2}));
  assert.equal(order.result.value,19750);
  assert.equal(order.result.landed,100250);
  const advice=await approve(await submit('E3','Accounts Executive',{po:order.id,amount:19750}));
  assert.equal(advice.status,'Awaiting Treasury');
  await action(advice,'Treasury','Confirm UTR',{utr:'TEST-UTR-001',paymentDate:last});
  const gate=await submit('E5','Site Store',{po:order.id,scenario:'UG tank',transporter:'LORRY-1',truck:'TEST201',driver:'Test tanker driver',
    mobile:'9000000000',fitness:'2099-12-31',licence:'2099-12-31',invoice:'TEST-001',invoiceDate:last,litres:200,
    eway:'TEST',seals:'TEST1',intact:'Yes',sealPhotos:[proof],billPhoto:[proof]});
  await approve(await submit('E6','Site Store',{gate:gate.id,instrument:'DIP-1',density:830,temperature:25,tank:'T-1',
    before:22,after:26,decision:'Accept',evidence:[proof]}));
  const grn=store.list('Jayant').find(item=>item.type==='E7');
  assert.equal(grn.result.accepted,200);
  assert.equal(grn.result.stockBookedTo,'T-1');
  const match=await approve(await submit('E8','Accounts Executive',{grn:grn.id,bill:'SUP201',billDate:last,litres:200,rate:98750,vat:0}));
  assert.equal(match.result.match,'Matched');
  const freight=await approve(await submit('E9','Accounts Executive',{grn:grn.id,bill:'FR201',billDate:last,gst:'FREIGHT'}));
  assert.equal(freight.result.net,354);
  const directIndent=await approve(await submit('E1','Site In-charge',{litres:120,requiredBy:0}));
  const directOrder=await approve(await submit('E2','Procurement Executive',{indent:directIndent.id,type:'Bulk',supplier:'SUP-10',
    depot:'DEP-1',basis:'Ex-depot',transporter:'LORRY-1',terms:'Credit',kl:0.12}));
  const directGate=await submit('E5','Site Store',{...gate.data,po:directOrder.id,scenario:'Direct to bowsers',
    truck:'TEST202',invoice:'TEST-002',litres:120,sealPhotos:[proof],billPhoto:[proof]});
  await approve(await submit('E6','Site Store',{gate:directGate.id,instrument:'DIP-1',density:830,temperature:25,decision:'Accept',evidence:[proof]}));
  await submit('E10B','Bowser operator',{gate:directGate.id,bowser:'B-2',start:0,end:120,evidence:[proof]});
  await approve(await submit('E10C','Bowser operator',{gate:directGate.id,empty:'Yes',evidence:[proof]}));
  const directGrn=store.list('Jayant').find(item=>item.type==='E7'&&item.data.gate===directGate.id);
  assert.equal(directGrn.result.accepted,120);
  assert.deepEqual(directGrn.result.stockBookedTo,['B-2']);
  await approve(await submit('E8','Accounts Executive',{grn:directGrn.id,bill:'SUP202',billDate:last,litres:120,rate:98750,vat:0}));
  await approve(await submit('E9','Accounts Executive',{grn:directGrn.id,bill:'FR202',billDate:last,gst:'FREIGHT'}));
  const operator=await signIn('Bowser operator');
  const issueForm=await (await request('/entries/new/E11',operator)).text();
  assert.match(issueForm,/value="F-20" data-tag="TAG-20"/);
  assert.match(issueForm,/D-20 · Site driver/);
  assert.match(issueForm,/name="readingTime"/);
  assert.match(issueForm,/data-capacity="120"/);
  assert.doesNotMatch(issueForm,/Fleet 01|Review driver/);
  const issue=randomUUID(), issueData={bowser:'B-2',vehicle:'F-20',driver:'D-20',reading:200,start:0,end:70,readingTime:last+'T08:00',
    evidence:[proof]};
  const body={actor:'Jayant-'+roleKey('Bowser operator'), type:'E11', day:last, action:'Submit', rev:0, data:issueData};
  const invalid=await request('/entries/record/'+issue,operator,{...body,data:{...issueData,vehicle:'Fleet 01'}});
  assert.equal(invalid.status,422);
  const posted=await request('/entries/record/'+issue,operator,body);
  assert.equal(posted.status,200,await posted.text());
  assert.equal(store.read(issue,'Jayant').shift.name,'Day shift');
  assert.match(await (await request('/entries/record/'+issue,operator)).text(),/Day shift/);
  assert.match(await (await request('/entries/new/E11',operator)).text(),/data-last-end="70"/);
  await submit('E11','Bowser operator',{...issueData,vehicle:'F-21',start:70,end:80});
  await approve(await submit('E14','Site Store',{pump:'PUMP',vehicle:'F-21',slip:'SLIP33',slipDate:last,litres:20,
    rate:95,total:1900,reading:203,evidence:[proof]}));
  const recovery=await approve(await submit('E13','Accounts Executive',{party:'HIRE',method:'Deduct from hire bill',fromDate:last,toDate:last}));
  assert.equal(recovery.result.litres,30);
  assert.equal(recovery.result.amount,3000);
  const unusedIndent=await approve(await submit('E1','Site In-charge',{litres:50,requiredBy:0}));
  const revised=await action(await submit('E16','Site In-charge',{target:unusedIndent.id,field:'remarks',value:'Updated note',reason:'REV',evidence:[proof]}),
    'Deputy Site In-charge');
  assert.equal(revised.status,'Posted');
  assert.equal(store.read(unusedIndent.id,'Jayant').status,'Superseded');
  const point=await signIn('Point operator');
  const transfer=await request('/entries/record/'+randomUUID(),point,{actor:'Jayant-'+roleKey('Point operator'),
    type:'E10A',day:last,action:'Submit',rev:0,
    data:{ tank:'T-1',bowser:'B-2',before:26,after:25,start:0,end:50,evidence:issueData.evidence }});
  assert.equal(transfer.status,200,await transfer.text());
  const bowserLoad=await (await request('/entries/new/E10A',point)).text();
  assert.match(bowserLoad,/<option value="B-2"[^>]*data-home-tank="T-1"/);
  assert.match(bowserLoad,/assets\/home-tank\.js/);
  const transferForm = await (await request('/entries/new/E12',await signIn('Site Store'))).text();
  assert.match(transferForm,/Majri · S-B · Majri bowser/);
  assert.match(transferForm,/Sasti · S-B · Receiving bowser/);
  const dispatch = {from:'B-2',bowser:'B-2',driver:'D-20',sent:30,evidence:[proof]};
  assert.equal((await request('/entries/record/'+randomUUID(),await signIn('Site Store'),{
    actor:'Jayant-'+roleKey('Site Store'),type:'E12',day:last,action:'Submit',rev:0,data:{...dispatch,to:'S-B'},
  })).status,422);
  const siteTransfer=await approve(await submit('E12','Site Store',{...dispatch,to:transferKey('Sasti','S-B')}));
  assert.equal(siteTransfer.result.destination,'Sasti');
  const received=await request('/entries/record/'+siteTransfer.id,sastiStore,{actor:'Sasti-'+roleKey('Site Store'),action:'Confirm receipt',rev:siteTransfer.rev,received:30,evidence:[proof]});
  assert.equal(received.status,200,await received.text());
  assert.equal(store.read(siteTransfer.id,'Sasti').result.received,30);
  const count=randomUUID();
  const countForm=await(await request('/entries/new/E15',point)).text();
  const fields=Object.fromEntries([...countForm.matchAll(/(?:B-2|T-1|T-2)[^<]+<input name="(measured\d+)"/g)].map(([match,key])=>[key,match.startsWith('B-2')?360:match.startsWith('T-1')?25:0]));
  assert.equal(Object.keys(fields).length,3);
  const counted=await request('/entries/record/'+count,point,{actor:'Jayant-'+roleKey('Point operator'),type:'E15',day:last,action:'Submit',rev:0,data:fields});
  assert.equal(counted.status,200,await counted.text());
  assert.equal((await request('/entries/record/'+count,maker,{actor:'Jayant-'+roleKey('Site In-charge'),action:'Approve',rev:1})).status,200);
  assert.ok(store.read(count,'Jayant').result.measurements.every(row=>row.variance===0));
  const close=await approve(await submit('E17','Head – Accounts',{month:last.slice(0,7),clearingAccount:'CLR',consumptionAccount:'EXP'},day));
  assert.equal(close.result.litres,1610);
  assert.equal(close.result.closingValue,147970.23);
  assert.equal(close.result.journal[0].account,'EXP');
  assert.equal(close.result.journal[0].debit+close.result.journal[1].debit,close.result.journal[2].credit);
  // A delivery schedule is an optional step between the order and the gate, so this walk-through does not raise one.
  assert.deepEqual(new Set(store.list('Jayant').map(row=>row.type)),new Set(siteEntryTypes.filter(type=>type!=='E4')));
  assert.equal(createEntryStore(mastersDb).list('Jayant').length,0);
});
