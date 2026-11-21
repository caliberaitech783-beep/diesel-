import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../../server.mjs';
import { openItemSubmissions } from './item-submissions.mjs';
import { openHostedMasterDatabase } from './hosted-master-storage.mjs';
import { createMasterStore } from './records.mjs';
import { recordDraftScope } from './records-fields.mjs';

const publicOrigin='https://diesel.test';
const root='/masters-workspace';
const pdf=Buffer.from('%PDF-1.4\nItem directory attachment\n%%EOF');
const fields=code=>({'Item Code':code,'Item Name':'Visible '+code,'Item Type':'Consumable','Group Name':'Fuel',
  'Measuring Unit':'L','Stock A/c':'Fuel stock','Valuation Method':'Weighted average','Consumption / Variation A/c':'Diesel consumption',
  SN:'1','Item Specification':'HSD BS VI','HSN Code':'00123456','Quality Required':'Yes',Status:'Active',
  'Density minimum (kg/m³)':'815','Density maximum (kg/m³)':'845','Volume basis':'Observed litres',
  Attachment:{name:'item.pdf',base64:pdf.toString('base64')}});

test('Item Master saves stay visible across general, maker, checker and other-site logins after restart',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'diesel-item-directory-'));
  const profiles={a:{login:'creator'},b:{login:'reader'},m:{login:'maker',dieselMasterAccess:[{site:'Mine A',role:'maker'}]},
    c:{login:'checker',dieselMasterAccess:[{site:'Mine A',role:'checker'}]},
    o:{login:'other-maker',dieselMasterAccess:[{site:'Mine B',role:'maker'}]}};
  let db,submissions,server;
  async function start() {
    db=openHostedMasterDatabase(join(directory,'masters.sqlite'));
    submissions=await openItemSubmissions(join(directory,'submissions'));
    const app=createApp({sharedMasterDb:db,itemSubmissions:submissions,
      env:{WEBSITE_SITE_NAME:'test',DIESEL_PUBLIC_ORIGIN:publicOrigin,DIESEL_SSO_CLIENT_SECRET:'s'.repeat(43),
        DIESEL_PULSE_ACCESS:'listed',DIESEL_ALLOWED_PULSE_LOGINS:'creator,reader'},
      fetcher:async(_url,options)=>{
        const profile=profiles[JSON.parse(options.body).grant?.[0]];
        return profile ? Response.json({profile}) : new Response(null,{status:401});
      }});
    server=app.listen(0,'127.0.0.1');
    await once(server,'listening');
    const origin='http://127.0.0.1:'+server.address().port;
    return (path,who='a',method='GET',payload)=>fetch(origin+path,{method,redirect:'manual',
      headers:{cookie:'__Host-diesel_session='+who.repeat(43),origin:publicOrigin,'content-type':'application/json'},
      body:payload===undefined ? undefined : JSON.stringify(payload)});
  }
  async function stop(){await new Promise(resolve=>server.close(resolve));db.close();}
  t.after(async()=>{await stop();await rm(directory,{recursive:true,force:true});});
  let req=await start();
  const privateApi='/api/masters/item-master/records';
  const privateResponse=await req(privateApi,'a','POST',{values:fields('PRIVATE-ITEM')});
  assert.equal(privateResponse.status,201);
  const personal=await privateResponse.json();
  const sharedApi=root+privateApi;
  const sharedResponse=await req(sharedApi,'m','POST',{values:fields('SITE-ITEM'),scope:recordDraftScope({id:'maker',site:'Mine A'},'item-master')});
  assert.equal(sharedResponse.status,201,await sharedResponse.clone().text());
  const shared=await sharedResponse.json();
  await stop();
  req=await start();
  const directoryApi='/api/master-data/records?master=item-master';
  for(const who of ['a','b','m','c','o']) {
    const prefix=['a','b'].includes(who) ? '' : root;
    const response=await req(prefix+directoryApi,who);
    assert.equal(response.status,200,who);
    const rows=(await response.json()).records;
    assert.deepEqual(rows.map(row=>row.code),['PRIVATE-ITEM','SITE-ITEM'],who);
    const page=await (await req(prefix+'/master-data?master=item-master',who)).text();
    for(const code of ['PRIVATE-ITEM','SITE-ITEM']) assert.match(page,new RegExp(code),who);
    for(const row of rows) {
      const detail=await req(row.recordPath+'&dialog=1',who);
      assert.equal(detail.status,200,who+' '+row.recordPath);
      const html=await detail.text();
      assert.match(html,new RegExp(row.code));
      const mayEdit=row.code==='PRIVATE-ITEM' ? who==='a' : who==='m';
      if(mayEdit) assert.match(html,/data-save-for-review/,who);
      else assert.doesNotMatch(html,/data-save-for-review|data-delete-record/,who);
      const link=html.match(/href="([^"]+\/attachments\/[^"?]+)"/)[1].replaceAll('&amp;','&');
      assert.deepEqual(Buffer.from(await (await req(link,who)).arrayBuffer()),pdf,who);
    }
    const search=(await (await req(prefix+directoryApi+'&q=SITE-ITEM',who)).json()).records;
    assert.deepEqual(search.map(row=>row.code),['SITE-ITEM']);
  }
  assert.equal((await req(sharedApi+'/'+shared.id,'o')).status,404,'original site write resource stays scoped');
  assert.equal((await req(sharedApi+'/'+shared.id,'b','PUT',{revision:1,values:fields('SITE-ITEM')})).status,403);
  assert.equal((await req(privateApi+'/'+personal.id,'b','PUT',{revision:1,reason:'Not owner',values:fields('PRIVATE-ITEM'),
    scope:recordDraftScope({id:'reader'},'item-master')})).status,403);
  const readPath='/item-directory/records?id=shared-'+shared.id;
  assert.equal((await req(readPath,'x')).status,303);
  assert.equal((await req('/item-directory/api/masters/item-master/records/shared-'+shared.id+'/attachments/'+shared.values.Attachment.id,'x')).status,401);
  assert.equal((await req(readPath+'&revision=1','b')).status,200);
  assert.equal((await req('/item-directory/records?id=shared-invalid','b')).status,404);
  const store=createMasterStore(db,['item-master']);
  const requested=store.changeStatus('item-master',shared.id,1,'delete',{id:'maker'},'Duplicate');
  store.changeStatus('item-master',shared.id,requested.revision,'approve',{id:'checker'});
  await submissions.delete({id:'creator'},'item-master',personal.id,{revision:1,reason:'Duplicate'});
  for(const [prefix,who] of [['','b'],[root,'o']]) assert.deepEqual((await (await req(prefix+directoryApi,who)).json()).records,[]);
});
