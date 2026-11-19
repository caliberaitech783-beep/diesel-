import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createApp } from '../../server.mjs';
import { masterDefinition, recordDraftScope, recordMasters } from './records-fields.mjs';
import { openHostedMasterDatabase } from './hosted-master-storage.mjs';
import { openItemSubmissions } from './item-submissions.mjs';
import { readActiveMasters } from './records.mjs';
import { businessDay, dayBefore } from '../entries/entry-rules.mjs';

const root = '/masters-workspace';
const origin = 'https://diesel.test';
const doc = {name:'spec.pdf',base64:Buffer.from('%PDF-1.4\n%%EOF').toString('base64')};
const day = businessDay();
const site = 'Silver Hill';
const otherSite = 'Quarry East';
const valuesFor = (slug, overrides = {}) => {
  const byType = {number:'10',date:day,time:'06:00',email:'test@example.com',file:doc};
  const defaults = Object.fromEntries(masterDefinition(slug).fields.filter(field=>field.required && !field.readOnly)
    .map(field=>[field.key,field.options?.[0] ?? field.suggestions?.[0] ?? byType[field.type] ?? 'Test']));
  return { ...defaults,...overrides };
};
const itemFields = {'Item Code':'HSD','Item Name':'Approved diesel','Density minimum (kg/m³)':'815',
  'Density maximum (kg/m³)':'845',Attachment:doc};
const storageFields = {'Storage Loc Code':'B01','Storage Loc. Name':'Silver Hill Bowser',Location:'SH-01',
  'Storage type':'Bowser','Capacity (L)':'2000','Safe fill level (L)':'1500','Minimum level (L)':'0'};
const approvalFields = {Entry:'E1','Initiator role':'Site In-charge','Quantity or value slab':'All',
  'Approver level 1 role':'Project Manager','Approval on Telegram with OTP allowed (Y/N)':'No','Effective from':day};
const alertFields = {Alert:'Transit shortage',Limit:'0.5%','First owner (role)':'Site In-charge',
  'Escalate to (role)':'Project Manager','Escalate after (hours)':'2','Channel (app, e-mail, Telegram)':'App'};
const valueOverrides = {'item-master':itemFields,'location-master':{'Location Code':'SH-01','Location Name':'Browser override','Receipt scenario allowed':'Both'},
  'storage-location-master':storageFields,'approval-limit-master':approvalFields,'tolerance-and-alert-master':alertFields,
  'shift-master':{Site:site,'Start time':'06:00','End time':'18:00'},
  'account-master':{'Is Market Petrol Pump':'No'},'transport-freight-master':{'To site':'SH-01'},
  'measuring-instrument-master':{'Fitted on (tank, bowser)':'B01'}};

test('shared Master Data uses verified Pulse roles and feeds approved Item, Location and Storage directly to Opening stock',async t=>{
  const dir = await mkdtemp(join(tmpdir(),'diesel-shared-masters-'));
  const path = join(dir,'masters.sqlite');
  const db = openHostedMasterDatabase(path);
  const itemSubmissions = await openItemSubmissions(join(dir,'previous'));
  const earlier = await itemSubmissions.create({id:'maker'},'item-master',valuesFor('item-master',{...itemFields,'Item Code':'OLD'}));
  const entry = role => ({site,role});
  const assignment = (role,scope=site) => ({site:scope,role,projectName:'Pulse '+scope,client:'Company client'});
  const profiles = {
    m:{login:'maker',dieselMasterAccess:[assignment('Master Maker'),assignment('checker'),assignment('maker',otherSite)],
      dieselEntryAccess:[entry('Site In-charge')]},
    c:{login:'checker',dieselMasterAccess:[assignment('Master Checker')],dieselEntryAccess:[entry('Project Manager')]},
    v:{login:'viewer',dieselMasterAccess:[assignment('viewer')]},
    o:{login:'other',dieselMasterAccess:[assignment('Master Viewer',otherSite)]},
    l:{login:'legacy'}, x:{login:'excluded'},
  };
  const app = createApp({env:{WEBSITE_SITE_NAME:'diesel',DIESEL_PUBLIC_ORIGIN:origin,
    DIESEL_SSO_CLIENT_SECRET:'s'.repeat(43),DIESEL_ALLOWED_PULSE_LOGINS:'maker,legacy'},itemSubmissions,
    sharedMasterDb:db,entryReviewDirectory:join(dir,'ledger'),fetcher:async(url,options)=>{
      if (url.pathname.endsWith('/exchange')) return Response.json({grant:'c'.repeat(43)});
      return Response.json({profile:profiles[JSON.parse(options.body).grant[0]]});
    }});
  const server = app.listen(0,'127.0.0.1');
  await once(server,'listening');
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();await rm(dir,{recursive:true,force:true});});
  const address = 'http://127.0.0.1:'+server.address().port;
  function req(path,who,options={}) {
    const { body, method = body?'POST':'GET', selection, headers } = options;
    const cookie = [who?'__Host-diesel_session='+who.repeat(43):'',selection].filter(Boolean).join('; ');
    return fetch(address+path,{redirect:'manual',method,headers:{cookie,Origin:origin,
      'Content-Type':body instanceof URLSearchParams?'application/x-www-form-urlencoded':'application/json',...headers},
      body:body instanceof URLSearchParams?body:body?JSON.stringify(body):undefined});
  }
  const api = slug => root+'/api/masters/'+slug+'/records';
  const scope = (slug,who,selected=site) => recordDraftScope({id:profiles[who].login,site:selected},slug);
  const save = (slug, overrides, who='m') => req(api(slug),who,{body:{scope:scope(slug,who),values:valuesFor(slug,overrides)}});
  const detail = (slug,id) => root+'/records?master='+slug+'&id='+id;
  const act = (record,action,who='c',extra={}) => req(api(record.master)+'/'+record.id+'/'+action,who,{
    body:{revision:record.revision,scope:scope(record.master,who),...extra}});
  async function submit(slug, overrides) {
    const response = await save(slug,overrides);
    assert.equal(response.status,201,await response.clone().text());
    const record = await response.json();
    assert.equal(record.status,'pending');
    return record;
  }
  async function approve(record) {
    const response = await act(record,'approve');
    assert.equal(response.status,200,await response.clone().text());
    const approved = await response.json();
    assert.equal(approved.status,'approved');
    return approved;
  }

  const signIn = await req(root);
  assert.equal(signIn.status,303);
  const state = new URL(signIn.headers.get('location')).searchParams.get('state');
  const callback = await req('/api/sign-in/callback?'+new URLSearchParams({state,code:'p'.repeat(43)}),null,
    {headers:{cookie:signIn.headers.get('set-cookie').split(';')[0]}});
  assert.equal(callback.headers.get('location'),root);
  assert.equal((await req(root+'/master-data','l')).status,403);
  assert.equal((await req(api('item-master'),'x')).status,403);
  assert.equal((await req(api('item-master'))).status,401);
  assert.match(await (await req('/','c')).text(),/\/masters-workspace\/master-data\?master=item-master/);
  assert.equal((await req('/?master=item-master','m')).headers.get('location'),root+'/records?master=item-master&new=1');
  assert.equal((await req('/?master=item-master','c')).headers.get('location'),root+'/records?master=item-master');
  assert.equal((await req(root+'/records?master=item-master&new=1','c')).status,403);
  assert.equal((await save('item-master',itemFields,'v')).status,403);
  const form = await (await req(root+'/records?master=item-master&new=1','m')).text();
  assert.match(form,/Save for review/);
  assert.match(form,/data-write-scope="[a-f0-9]{64}"/);
  assert.match(form,/Import/);
  assert.match(form,/Export/);
  const shared = await (await req(root+'/master-data?master=item-master','m')).text();
  assert.match(shared,/My earlier submissions/);
  assert.match(shared,/data-review-url="\/masters-workspace\/records/);
  assert.equal((await req('/records?master=item-master&id='+earlier.id,'m')).status,200);
  assert.equal((await req('/records?master=item-master&id='+earlier.id,'c')).status,303);
  assert.deepEqual((await (await req('/healthz')).json()).openingStock,'setup');
  assert.match(await (await req('/entries/opening-stock','m')).text(),/Entry is awaiting site setup/);

  const location = await submit('location-master',valueOverrides['location-master']);
  assert.equal(location.name,'Pulse Silver Hill');
  assert.equal(location.values.Client,'Company client');
  assert.equal((await save('storage-location-master',storageFields)).status,422);
  assert.equal((await act(location,'approve','m')).status,403);
  assert.equal((await act(location,'approve','v')).status,403);
  assert.equal((await act(location,'approve','c',{scope:scope(location.master,'m')})).status,409);
  await approve(location);
  const reopened = await req(root+'/records?master=location-master&new=1','m');
  assert.equal(reopened.headers.get('location'),detail('location-master',location.id));
  const item = await submit('item-master',itemFields);
  const storage = await submit('storage-location-master',storageFields);
  assert.deepEqual(readActiveMasters(db,site,['item-master'])['item-master'],[]);
  assert.doesNotMatch(await (await req('/entries/opening-stock','m')).text(),/B01|Approved diesel/);
  assert.equal((await req(detail('item-master',item.id),'o')).status,404);
  const attach = api('item-master')+'/'+item.id+'/attachments/'+item.values.Attachment.id;
  assert.equal((await req(attach,'o')).status,404);
  assert.equal((await req(attach,'c')).status,200);
  const itemCheck = await (await req(detail('item-master',item.id),'c')).text();
  assert.match(itemCheck,/Approve revision/);
  assert.match(itemCheck,/Return for changes/);
  assert.doesNotMatch(itemCheck,/Save for review/);

  const selection = await req(root+'/site','m',{body:new URLSearchParams({site:otherSite,master:'item-master',view:'records'})});
  assert.equal(selection.status,303);
  const selectedCookie = selection.headers.get('set-cookie').split(';')[0];
  const rejected = await req(api('item-master'),'m',{selection:selectedCookie,body:{scope:scope('item-master','m'),values:valuesFor('item-master',itemFields)}});
  assert.equal(rejected.status,409);
  assert.equal((await req(root+'/site','o',{body:new URLSearchParams({site})})).status,403);
  const exports = root+'/api/master-data/records?master=item-master';
  assert.deepEqual((await (await req(exports,'o')).json()).records,[]);
  assert.equal((await req(api('item-master'),'m',{headers:{Origin:'https://other.test'},body:{scope:scope('item-master','m'),values:{}}})).status,403);

  const approved = await approve(item);
  await approve(storage);
  const opening = '/entries/opening-stock';
  const openingPage = await (await req(opening,'m')).text();
  assert.match(openingPage,/HSD · Approved diesel/);
  assert.match(openingPage,/B01 · Silver Hill Bowser/);
  const recorded = await req(opening,'m',{body:new URLSearchParams({item:'HSD',measuredAt:dayBefore(day)+'T06:00',
    revision:'0',code:'B01',litres:'100',openingRate:'90000'})});
  assert.equal(recorded.status,303,await recorded.text());
  assert.equal((await req(opening+'/approve','c',{body:new URLSearchParams({revision:'1'})})).status,303);

  const update = await req(api('item-master')+'/'+item.id,'m',{method:'PUT',body:{
    revision:approved.revision,scope:scope('item-master','m'),reason:'Revise item label',
    values:valuesFor('item-master',{...itemFields,'Item Name':'Proposed label',Attachment:{id:item.values.Attachment.id}})}});
  assert.equal(update.status,200,await update.clone().text());
  const pending = await update.json();
  assert.equal((await act(pending,'return')).status,422);
  const returnResponse = await act(pending,'return','c',{reason:'Keep the approved item label'});
  assert.equal((await returnResponse.json()).status,'returned');
  assert.equal(readActiveMasters(db,site,['item-master'])['item-master'][0].name,'Approved diesel');
  const history = await (await req(api('item-master')+'/'+item.id+'/history','c')).json();
  assert.equal(history[0].reason,'Keep the approved item label');
  assert.equal(history[0].actorId,'checker');
  assert.equal((await act(pending,'approve')).status,409);

  for (const slug of recordMasters.filter(value=>!['item-master','location-master','storage-location-master'].includes(value))) {
    await approve(await submit(slug,valueOverrides[slug]));
  }
  const unknownSupplier = await save('diesel-rate-master',{Supplier:'Tset','Effective from':'2031-01-01'});
  assert.equal(unknownSupplier.status,422);
  assert.match((await unknownSupplier.json()).error,/approved Account Master record for Supplier/);
  const wrongDepot = await save('diesel-rate-master',{Depot:'Elsewhere','Effective from':'2031-01-01'});
  assert.match((await wrongDepot.json()).error,/approved Supplier Depot Master record for Depot/);
  const freightForm = await (await req(root+'/records?master=transport-freight-master&new=1','m')).text();
  assert.match(freightForm,/<select[^>]*name="Transporter"[^>]*>.*?<option value="Test">Test · Test<\/option>/s);
  assert.match(freightForm,/<select[^>]*name="To site"[^>]*>.*?<option value="SH-01">Pulse Silver Hill · SH-01<\/option>/s);
  const all = await (await req(root+'/api/master-data/records','c')).json();
  assert.equal(new Set(all.records.map(record=>record.slug)).size,20);
  const cmllId=all.records.find(record=>record.slug==='cmll-master').id;
  const cmllPath=api('cmll-master')+'/'+cmllId;
  const cmll=await (await req(cmllPath,'m')).json();
  const attributes=[
    {name:'GSTIN',reference:'Maharashtra',value:'GST-Registration-1',validFrom:'2020-01-01',attachment:doc},
    {name:'Licence or certificate',reference:'Site licence',value:'Licence-02',validTo:day,attachment:{...doc,name:'licence.pdf'}},
  ];
  const change=attrs=>req(cmllPath,'m',{method:'PUT',body:{revision:cmll.revision,scope:scope('cmll-master','m'),
    reason:'Add dated registrations',values:cmll.values,attributes:attrs}});
  assert.equal((await change([{...attributes[0],validTo:'2019-12-31'}])).status,422);
  const attrRevision=await (await change(attributes)).json();
  assert.equal(attrRevision.attributes.length,2);
  assert.notEqual(attrRevision.attributes[0].attachment.id,attrRevision.attributes[1].attachment.id);
  const expiryPage=root+'/master-data?master=cmll-master';
  assert.doesNotMatch(await (await req(expiryPage,'c')).text(),/Attribute expiry alerts/);
  await approve(attrRevision);
  const attributeHtml=await (await req(detail('cmll-master',cmllId),'c')).text();
  assert.match(attributeHtml,/GST-Registration-1/);
  assert.match(attributeHtml,/licence.pdf/);
  assert.match(await (await req(expiryPage,'c')).text(),/Attribute expiry alerts/);
  const attributeFile=cmllPath+'/attachments/'+attrRevision.attributes[1].attachment.id;
  assert.equal((await req(attributeFile,'c')).status,200);
  assert.equal((await req(attributeFile,'o')).status,404);
  const cmllExport=await (await req(root+'/api/master-data/records?master=cmll-master','c')).json();
  const publishedAttributes=JSON.parse(cmllExport.records[0].fields.find(([key])=>key==='Dated attributes')[1]);
  assert.equal(publishedAttributes[1].attachmentName,'licence.pdf');
  const {id:reasonId} = all.records.find(record=>record.slug==='reason-code-master');
  const reason = await (await req(api('reason-code-master')+'/'+reasonId,'m')).json();
  const retirement = await (await act(reason,'deactivate','m',{reason:'Retire the test reason'})).json();
  assert.equal(retirement.status,'pending_deactivation');
  assert.equal(readActiveMasters(db,site,['reason-code-master'])['reason-code-master'].length,1);
  const retired = await (await act(retirement,'approve')).json();
  assert.equal(retired.status,'inactive');
  assert.equal(readActiveMasters(db,site,['reason-code-master'])['reason-code-master'].length,0);
  const reactivated = await (await act(retired,'reactivate','m',{reason:'Restore the test reason'})).json();
  await approve(reactivated);
  profiles.c.dieselMasterAccess = [];
  assert.equal((await req(exports,'c')).status,403);
  const reopenedDb = openHostedMasterDatabase(path);
  try { assert.equal(readActiveMasters(reopenedDb,site,['item-master'])['item-master'][0].code,'HSD'); }
  finally { reopenedDb.close(); }
});
