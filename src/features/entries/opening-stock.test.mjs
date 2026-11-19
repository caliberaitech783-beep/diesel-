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

test('site Entry uses approved opening readings and master codes without mixing the review ledger', async t=>{
  const mastersDb=openDieselDatabase(':memory:'), siteDb=openDieselDatabase(':memory:');
  const server=createLocalWorkspace(mastersDb,{siteEntryDb:siteDb}).listen(0,'127.0.0.1');
  await once(server,'listening');
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));siteDb.close();mastersDb.close();});
  const origin='http://127.0.0.1:'+server.address().port;
  syncPulseProjects(mastersDb,[{ name:'Test Client 1', sites:['Jayant OC'] },{ name:'Test Client 2', sites:['Sasti OC'] }]);
  const kinds=['item-master','location-master','storage-location-master','cost-centre-vehicle-master','driver-master'];
  const masters=createMasterStore(mastersDb,kinds);
  const sample={number:'10',date:'2025-01-01',time:'06:00',email:'test@example.com'};
  function master(kind,fields,{approve=true}={}) {
    const defaults=Object.fromEntries(masterDefinition(kind).fields.filter(field=>field.required)
      .map(field=>[field.key,field.options?.[0]??sample[field.type]??'Test']));
    const record=masters.create(kind,{site:'Jayant',values:{...defaults,...fields}},{id:'master-maker'});
    if(approve) masters.changeStatus(kind,record.id,record.revision,'approve',{id:'master-checker'});
  }
  master('item-master',{'Item Code':'HSD-A','Item Name':'Site diesel','Density minimum (kg/m³)':'815','Density maximum (kg/m³)':'845'});
  master('location-master',{'Location Code':'J-01'});
  const storage={'Storage type':'UG tank',Location:'J-01','Capacity (L)':'2000','Safe fill level (L)':'1500',
    'Calibration chart (dip-to-litres table, UG tanks)':'cm,litres\n0,0\n20,1000\n40,2000'};
  master('storage-location-master',{...storage,'Storage Loc Code':'T-1','Storage Loc. Name':'Main tank'});
  master('storage-location-master',{...storage,'Storage Loc Code':'T-2','Storage Loc. Name':'Second tank'});
  master('storage-location-master',{...storage,'Storage type':'Bowser','Storage Loc Code':'B-2','Storage Loc. Name':'Site bowser'});
  master('storage-location-master',{...storage,'Storage Loc Code':'T-3','Storage Loc. Name':'Pending tank'},{approve:false});
  master('cost-centre-vehicle-master',{'Cost Centre Code':'CC-20','Fleet No.':'F-20','Registration No.':'TEST01',Ownership:'Own',
    'Fuel tank capacity (L)':'120','Meter reading at go-live':'200','QR or RFID tag No.':'TAG-20'});
  master('driver-master',{'Employee Code':'D-20','Employee Name':'Site driver'});
  function request(path,cookie,body) {
    return fetch(origin+path,{redirect:'manual',method:body?'POST':'GET',
      headers:{Origin:origin,'Content-Type':body instanceof URLSearchParams?'application/x-www-form-urlencoded':'application/json',...(cookie?{cookie}:{})},
      body:body instanceof URLSearchParams?body:JSON.stringify(body)});
  }
  async function signIn(role,site='Jayant') {
    const response=await request('/workspace/role',null,new URLSearchParams({role:roleKey(role),site}));
    assert.equal(response.status,303);
    return response.headers.get('set-cookie').split(';')[0];
  }
  const maker=await signIn('Site In-charge'), checker=await signIn('Project Manager'), other=await signIn('Project Manager','Sasti');
  const opening='/entries/opening-stock';
  const draft=await (await request(opening,maker)).text();
  assert.match(draft,/T-2/);
  assert.doesNotMatch(draft,/Pending tank|UG tank 01/);
  assert.equal((await request('/entries/new/E1',maker)).headers.get('location'),opening);
  assert.equal((await request('/entries/type/E2',maker)).status,404);
  const day=businessDay();
  const setup=new URLSearchParams({item:'HSD-A',measuredAt:dayBefore(day)+'T07:00',revision:'0'});
  setup.append('code','T-1');setup.append('litres','1100');
  setup.append('code','T-2');setup.append('litres','0');
  assert.equal((await request(opening,maker,setup)).status,422);
  setup.append('code','B-2');setup.append('litres','300');
  assert.equal((await request(opening,maker,setup)).status,303);
  assert.equal((await request(opening+'/approve',maker,new URLSearchParams({revision:'1'}))).status,403);
  assert.equal((await request(opening+'/approve',other,new URLSearchParams({revision:'1'}))).status,409);
  assert.equal((await request(opening+'/approve',checker,new URLSearchParams({revision:'1'}))).status,303);
  assert.equal((await request(opening,maker,setup)).status,409);
  const indent=await (await request('/entries/new/E1',maker)).text();
  assert.match(indent,/HSD-A · Site diesel/);
  assert.match(indent,/1,400/);
  const operator=await signIn('Bowser operator');
  const issueForm=await (await request('/entries/new/E11',operator)).text();
  assert.match(issueForm,/value="F-20" data-tag="TAG-20"/);
  assert.match(issueForm,/D-20 · Site driver/);
  assert.doesNotMatch(issueForm,/Fleet 01|Review driver/);
  const issue=randomUUID(), issueData={bowser:'B-2',vehicle:'F-20',driver:'D-20',reading:200,start:0,end:70,
    evidence:[{name:'meter.png',base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='}]};
  const body={actor:'Jayant-'+roleKey('Bowser operator'), type:'E11', day, action:'Submit', rev:0, data:issueData};
  const invalid=await request('/entries/record/'+issue,operator,{...body,data:{...issueData,vehicle:'Fleet 01'}});
  assert.equal(invalid.status,422);
  const posted=await request('/entries/record/'+issue,operator,body);
  assert.equal(posted.status,200,await posted.text());
  const point=await signIn('Point operator');
  const transfer=await request('/entries/record/'+randomUUID(),point,{actor:'Jayant-'+roleKey('Point operator'),
    type:'E10A',day,action:'Submit',rev:0,
    data:{ tank:'T-1',bowser:'B-2',before:22,after:21,start:0,end:50,evidence:issueData.evidence }});
  assert.equal(transfer.status,200,await transfer.text());
  const count=randomUUID();
  const countForm=await(await request('/entries/new/E15',point)).text();
  const fields=Object.fromEntries([...countForm.matchAll(/(?:B-2|T-1|T-2)[^<]+<input name="(measured\d+)"/g)].map(([match,key])=>[key,match.startsWith('B-2')?280:match.startsWith('T-1')?21:0]));
  assert.equal(Object.keys(fields).length,3);
  const counted=await request('/entries/record/'+count,point,{actor:'Jayant-'+roleKey('Point operator'),type:'E15',day,action:'Submit',rev:0,data:fields});
  assert.equal(counted.status,200,await counted.text());
  assert.equal((await request('/entries/record/'+count,maker,{actor:'Jayant-'+roleKey('Site In-charge'),action:'Approve',rev:1})).status,200);
  const close=createEntryStore(siteDb).read(count,'Jayant');
  assert.ok(close.result.measurements.every(row=>row.variance===0));
  assert.equal(createEntryStore(mastersDb).list('Jayant').length,0);
});
