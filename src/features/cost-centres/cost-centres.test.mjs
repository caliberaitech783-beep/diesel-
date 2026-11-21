import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { costCentreRecords, costCentreSlug, mergeCostCentres } from './cost-centre-records.mjs';
import { createPulseCostCentres } from './pulse-cost-centres.mjs';
import { createApp } from '../../server.mjs';
import { openHostedMasterDatabase } from '../masters/hosted-master-storage.mjs';
import { openItemSubmissions } from '../masters/item-submissions.mjs';
import { createMasterStore, readActiveMasters } from '../masters/records.mjs';
import { recordDraftScope } from '../masters/records-fields.mjs';

const equipment = [
  { door:'V-101', reg:'MH34AB1234', equipmentName:'Tipper', category:'VEHICLE', group:'Tipper',
    currentLocation:'Sasti OC', make:'Volvo', model:'FMX', chassisNo:'CH-1', engineNo:'EN-1', status:'Active' },
  { door:'EX-7', reg:'', equipmentName:'Excavator', category:'EQUIPMENT', group:'Excavator', currentLocation:'Sasti OC', status:'Active' },
  { door:'DG-1', equipmentName:'Generator', category:'EQUIPMENT', currentLocation:'Majri OC', status:'Active' },
];
const syncedAt = '2026-11-21T08:00:00.000Z';

test('Cost Centre Master includes vehicles and unregistered equipment without guessing Diesel settings', () => {
  const records = costCentreRecords({ records:[...equipment, equipment[0], { door:'-', reg:'N/A' }], syncedAt });
  assert.deepEqual(records.map(row=>row.code), ['V-101','EX-7','DG-1']);
  const vehicle = records[0], machine = records[1];
  assert.equal(vehicle.values['Cost Centre Type'], 'VEHICLE');
  assert.equal(vehicle.values['Make and model'], 'Volvo FMX');
  assert.equal(vehicle.values['Chassis No.'], 'CH-1');
  assert.equal(machine.values['Registration No.'], '');
  assert.equal(machine.values['Cost Centre Type'], 'EQUIPMENT');
  for (const row of records) {
    assert.equal(row.canEdit, false);
    assert.equal(row.status, 'reference');
    for (const key of ['Ownership','Fuel tank capacity (L)','Meter type','Meter reading at go-live','QR or RFID tag No.']) assert.equal(row.values[key], undefined);
  }
  const updated = costCentreRecords({ records:[{...equipment[0], equipmentName:'Updated tipper', currentLocation:'Majri OC'}], syncedAt:'later' });
  assert.equal(updated[0].id, vehicle.id, 'renaming or moving an asset keeps its identity');
  assert.equal(updated[0].site, 'Majri OC');
  assert.equal(costCentreRecords({records:[{reg:'MH1'}]})[0].code, 'MH1');
  assert.equal(costCentreRecords({records:[{asset:'ASSET1'}]})[0].code, 'ASSET1');
});

test('saved Diesel cost centres replace source duplicates before search, sorting and pagination', () => {
  const sources = costCentreRecords({ records:equipment, syncedAt });
  const saved = [{ master:costCentreSlug, id:'saved', code:'CC-1', name:'Configured vehicle', status:'approved',
    values:{'Fleet No.':'v 101','Fuel tank capacity (L)':'400'} }];
  const combined = mergeCostCentres(saved, sources);
  assert.equal(combined.length, 3);
  assert.equal(combined.find(row=>row.id==='saved').values['Fuel tank capacity (L)'], '400');
  assert.ok(!combined.some(row=>row.pulseSource && row.code==='V-101'));
  assert.equal(mergeCostCentres(saved,sources,{search:'Tipper'}).length,0,'a filtered-out saved record does not resurrect the source duplicate');
  assert.deepEqual(mergeCostCentres(saved,sources,{search:'Excavator'}).map(row=>row.code),['EX-7']);
  assert.deepEqual(mergeCostCentres(saved,sources,{offset:1,limit:1}).map(row=>row.code), ['DG-1']);
  assert.equal(mergeCostCentres([{...saved[0],values:{'Registration No.':'MH 34 AB 1234'}}],sources).length,3);
  const repeatedRegistration = costCentreRecords({records:[...equipment,{...equipment[0],door:'V-102'}],syncedAt});
  assert.equal(mergeCostCentres([],repeatedRegistration).length,4,'distinct fleet assets stay visible despite a duplicate registration in Pulse');
  assert.ok(mergeCostCentres(saved,repeatedRegistration).some(row=>row.code==='V-102'));
  assert.equal(mergeCostCentres([{...saved[0],status:'deleted'}],sources).length,2);
  assert.throws(()=>mergeCostCentres([],sources,{offset:-1}));
});

test('Pulse cost centres require access and enforce a selected site even for a global Pulse reader', async () => {
  let reads = 0;
  const read = createPulseCostCentres({ getAccess:async request=>request.allowed ? {grant:'test'} : null,
    readEquipment:async()=>{reads++;return {records:equipment,syncedAt,fresh:true};} });
  assert.deepEqual(await read({request:{allowed:false}}), []);
  assert.equal(reads,0);
  assert.deepEqual((await read({request:{allowed:true},sites:['SASTI OB']})).map(row=>row.code),['V-101','EX-7']);
});

const configured = (code, fleet, registration) => ({
  'Cost Centre Code':code, 'Cost Centre Name':'Configured '+fleet, 'Cost Centre Type':'Vehicle',
  'Fleet No.':fleet, 'Registration No.':registration, 'Vehicle type':'Tipper', 'Make and model':'Volvo FMX',
  Ownership:'Owned', 'Project (location)':'Sasti OC', Status:'Active', 'Fuel tank capacity (L)':'400',
  'Meter type':'Kilometre meter', 'Meter reading at go-live':'100', 'QR or RFID tag No.':'QR-'+code,
});

test('equipment fuel settings can be submitted without inventing a road registration', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const store = createMasterStore(db,[costCentreSlug]);
    const values = {...configured('EX-7','EX-7',''), 'Cost Centre Type':'Equipment','Vehicle type':'Excavator','Meter type':'Hour meter'};
    const saved = store.create(costCentreSlug,{site:'Sasti',values},{id:'maker'});
    assert.equal(saved.values['Registration No.'],undefined);
    assert.equal(saved.values['Meter type'],'Hour meter');
    assert.equal(saved.status,'pending');
  } finally { db.close(); }
});

test('live Cost Centre Master Data, exports and counts include both asset types and keep site and write access intact', async t => {
  const dir = await mkdtemp(join(tmpdir(),'diesel-cost-centres-'));
  const db = openHostedMasterDatabase(join(dir,'masters.sqlite'));
  const submissions = await openItemSubmissions(join(dir,'submissions'));
  const shared = createMasterStore(db,[costCentreSlug]);
  const siteProfile = {login:'maker',name:'Site Maker',dieselMasterAccess:[{site:'Sasti',role:'maker',projectName:'Sasti OC',client:'WCL'}]};
  const profiles = {a:{login:'admin',name:'Admin'},m:siteProfile,v:{...siteProfile,login:'viewer',dieselMasterAccess:[{site:'Sasti',role:'viewer',projectName:'Sasti OC',client:'WCL'}]}};
  const current = structuredClone(equipment);
  let now = Date.parse(syncedAt), pulseUp = true, fetched = 0;
  const origin = 'https://diesel.test';
  const app = createApp({itemSubmissions:submissions,sharedMasterDb:db,pulseMasterClock:()=>now,
    env:{WEBSITE_SITE_NAME:'diesel',DIESEL_PUBLIC_ORIGIN:origin,DIESEL_SSO_CLIENT_SECRET:'s'.repeat(43),DIESEL_PULSE_ACCESS:'listed',DIESEL_ALLOWED_PULSE_LOGINS:'admin,maker'},
    fetcher:async(url,options)=>{
      const {grant}=JSON.parse(options.body);
      if (!profiles[grant?.[0]]) return new Response(null,{status:401});
      if (!url.pathname.endsWith('/masters')) return Response.json({profile:profiles[grant[0]]});
      fetched++;
      return pulseUp ? Response.json({masters:{region:[],site:[],equipment:current,employee:[],driver:[],shift:[]}}) : new Response(null,{status:503});
    },
  });
  const server=app.listen(0,'127.0.0.1');
  await once(server,'listening');
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();await rm(dir,{recursive:true,force:true});});
  const request=(path,who='a',options={})=>fetch('http://127.0.0.1:'+server.address().port+path,{redirect:'manual',...options,
    headers:{accept:'application/json',...(who?{cookie:'__Host-diesel_session='+who.repeat(43)}:{}),...options.headers}});
  const read=async(path,who='a')=>{const response=await request(path,who);assert.equal(response.status,200,await response.clone().text());return response.json();};
  const master='/api/master-data/records?master='+costCentreSlug;
  const initial=await read(master);
  assert.deepEqual(initial.records.map(row=>row.code),['DG-1','EX-7','V-101']);
  const machine=initial.records.find(row=>row.code==='EX-7');
  assert.equal(new Map(machine.fields).get('Registration No.'),'');
  assert.equal(new Map(machine.fields).get('Fuel tank capacity (L)'),'');
  assert.equal(machine.canEdit,false);
  assert.equal((await read('/api/master-insights/counts')).masters[costCentreSlug],3);
  const detail=await (await request('/records?master='+costCentreSlug+'&id='+machine.id)).text();
  assert.match(detail,/Vehicles and equipment/);
  assert.doesNotMatch(detail,/data-save-for-review|data-delete-record|data-action="approve"/);
  assert.equal((await request('/api/masters/'+costCentreSlug+'/records/'+machine.id,'a',{method:'PUT',
    headers:{origin,'content-type':'application/json'},body:JSON.stringify({scope:recordDraftScope({id:'admin'},costCentreSlug),revision:1,
      reason:'Source stays read-only',values:configured('EX-7','EX-7','MH1')})})).status,404);
  assert.equal((await request(master,null)).status,401);

  await submissions.create({id:'admin'},costCentreSlug,configured('CC-PRIVATE','V-101','MH34AB1234'));
  const merged=await read(master);
  assert.equal(merged.records.length,3);
  assert.ok(!merged.records.some(row=>row.code==='V-101'));
  assert.equal(new Map(merged.records.find(row=>row.code==='CC-PRIVATE').fields).get('Fuel tank capacity (L)'),'400');
  assert.equal((await read('/api/master-insights/counts')).masters[costCentreSlug],3);

  shared.create(costCentreSlug,{site:'Sasti',values:configured('CC-SITE','V-101','MH34AB1234')},{id:'site-maker'});
  const scoped=await read('/masters-workspace'+master,'m');
  assert.deepEqual(scoped.records.map(row=>row.code),['CC-SITE','EX-7']);
  assert.deepEqual((await read('/masters-workspace'+master,'v')).records.map(row=>row.code),['CC-SITE','EX-7']);
  const other=initial.records.find(row=>row.code==='DG-1');
  assert.equal((await request('/masters-workspace/api/masters/'+costCentreSlug+'/records/'+other.id,'m')).status,404);
  const siteDetail=await (await request('/masters-workspace/records?master='+costCentreSlug+'&id='+machine.id,'m')).text();
  assert.match(siteDetail,/Excavator/);
  assert.doesNotMatch(siteDetail,/data-save-for-review|data-delete-record|data-action="approve"/);
  assert.equal(readActiveMasters(db,'Sasti',[costCentreSlug])[costCentreSlug].length,0,'source rows and pending configuration do not become approved fuel masters');
  assert.equal(fetched,1,'the existing Pulse copy is reused');

  current[1].equipmentName='Hydraulic excavator';
  current.push({door:'DG-2',equipmentName:'New generator',currentLocation:'Sasti OC',category:'EQUIPMENT'});
  now+=30_001;
  const updated=await read(master);
  assert.equal(updated.records.length,4);
  assert.equal(updated.records.find(row=>row.code==='EX-7').id,machine.id);
  assert.equal(updated.records.find(row=>row.code==='EX-7').name,'Hydraulic excavator');
  assert.equal(fetched,2);
  const filtered=await (await request('/master-data?master='+costCentreSlug+'&q=Hydraulic&by=Cost+Centre+Name')).text();
  assert.match(filtered,/Hydraulic excavator/);
  assert.doesNotMatch(filtered,/>Configured V-101<|>New generator</);
  pulseUp=false;now+=30_001;
  assert.equal((await read(master)).records.length,4,'an outage retains the last valid copy');
});
