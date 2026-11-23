import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createApp } from '../../server.mjs';
import { openDieselDatabase } from '../../data/database.mjs';
import { indentRequester } from './indent-requester.mjs';
import { businessDay } from './entry-rules.mjs';

const employees=[{empId:'E001',name:'Ravi Kumar',email:'ravi@example.test'},
  {empId:'E002',name:'Ravi Kumar',email:'other@example.test'}];

test('requester uses verified identifiers or an unambiguous authenticated employee name',()=>{
  const expected={empId:'E001',name:'Ravi Kumar'};
  assert.deepEqual(indentRequester({login:' e001 '},employees),expected);
  assert.deepEqual(indentRequester({login:'RAVI@EXAMPLE.TEST'},employees),expected);
  assert.deepEqual(indentRequester({login:'operator',employeeId:'E001'},employees),expected);
  assert.deepEqual(indentRequester({login:'operator',email:'ravi@example.test'},employees),expected);
  assert.deepEqual(indentRequester({login:'operator-login',name:'  RAVI KUMAR '},[employees[0]]),expected);
  assert.equal(indentRequester({login:'unknown',name:'Ravi Kumar'},employees),undefined);
  assert.equal(indentRequester({login:'operator',empId:'missing',email:'ravi@example.test',name:'Ravi Kumar'},[employees[0]]),undefined);
  assert.equal(indentRequester({login:'ravi@example.test'},[...employees,{empId:'E003',name:'Other',email:'ravi@example.test'}]),undefined);
  assert.equal(indentRequester({login:'E001'},[...employees,{empId:'E001',name:'Different employee'}]),undefined);
});

test('hosted indents resolve the submitting employee from Pulse Master and retain it after save and review',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'diesel-indent-requester-'));
  const masterDb=openDieselDatabase(':memory:');
  const origin='https://diesel.test';
  const profiles={a:{login:'ravi@example.test',name:'Account display name',dieselEntryAccess:[{site:'Jayant',role:'Site In-charge'}]},
    b:{login:'other@example.test',dieselEntryAccess:[{site:'Jayant',role:'Project Manager'}]},
    c:{login:'unlinked',dieselEntryAccess:[{site:'Jayant',role:'Site In-charge'}]},
    d:{login:'operator-login',name:'Test Operator',dieselEntryAccess:[{site:'Jayant',role:'Site In-charge'}]}};
  let masterName='Ravi Kumar',masterReads=0;
  const app=createApp({sharedMasterDb:masterDb,entryReviewDirectory:directory,
    env:{DIESEL_ACCESS_MODE:'pulse',DIESEL_ENTRY_ACCESS_MODE:'assigned-pilot',DIESEL_PUBLIC_ORIGIN:origin,DIESEL_SSO_CLIENT_SECRET:'s'.repeat(43)},
    fetcher:async(url,options)=>{
      if(url.pathname.endsWith('/masters')) {
        masterReads++;
        return Response.json({masters:{site:[],region:[],equipment:[],employee:[{...employees[0],name:masterName},employees[1],{empId:'E003',name:'Test Operator'}],driver:[],shift:[]}});
      }
      return Response.json({profile:profiles[JSON.parse(options.body).grant[0]]});
    }});
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));masterDb.close();await rm(directory,{recursive:true,force:true});});
  const base='http://127.0.0.1:'+server.address().port;
  const request=(path,who='a',body)=>fetch(base+path,{redirect:'manual',method:body?'POST':'GET',
    headers:{Origin:origin,cookie:'__Host-diesel_session='+who.repeat(43),'Content-Type':'application/json'},body:body&&JSON.stringify(body)});
  const form=await (await request('/entries/new/E1?site=Jayant')).text();
  const namedFormResponse=await request('/entries/new/E1?site=Jayant','d');
  assert.equal(namedFormResponse.headers.get('referrer-policy'),'same-origin');
  const namedForm=await namedFormResponse.text();
  assert.match(namedForm,/<strong>Test Operator · E003<\/strong>/);
  assert.doesNotMatch(namedForm,/not linked|not registered/);
  assert.match(form,/<span>Requested by<\/span><strong>Ravi Kumar · E001<\/strong>/);
  assert.doesNotMatch(form,/Account display name/);
  assert.equal(masterReads,1);
  const id=form.match(/id="entry-form" data-id="([a-f0-9-]+)"/)[1];
  const body={type:'E1',site:'Jayant',day:businessDay(),action:'Save indent',rev:0,actor:JSON.stringify(['ravi@example.test','Jayant.entry-0']),
    requester:{empId:'FORGED',name:'Forged'},data:{litres:100,requiredBy:2,requestedBy:'Forged'}};
  const response=await request('/entries/record/'+id,'a',body);
  assert.equal(response.status,200,await response.clone().text());
  const saved=await response.json();
  assert.equal(saved.url,'/entries/record/'+id);
  const html=await (await request(saved.url)).text();
  assert.match(html,/value="CMLL\/JOC\/IND\/\d{2}-\d{2}\/001"/);
  assert.match(html,/<strong>Ravi Kumar · E001<\/strong>/);
  assert.doesNotMatch(html,/Forged|FORGED|HSN code/);
  masterName='Changed name';
  const reviewed=await (await request(saved.url,'b')).text();
  assert.match(reviewed,/<strong>Ravi Kumar · E001<\/strong>/);
  assert.doesNotMatch(reviewed,/<strong>Ravi Kumar · E002<\/strong>/);
  const namedId=namedForm.match(/id="entry-form" data-id="([a-f0-9-]+)"/)[1];
  const namedSaved=await request('/entries/record/'+namedId,'d',{...body,actor:JSON.stringify(['operator-login','Jayant.entry-0']),data:{litres:150,requiredBy:2,reason:'Operational demand'}});
  assert.equal(namedSaved.status,200,await namedSaved.clone().text());
  const namedRecord=await (await request('/entries/record/'+namedId,'d')).text();
  assert.match(namedRecord,/<strong>Test Operator · E003<\/strong>/);
  assert.match(namedRecord,/<details class="indent-secondary" open><summary>Site stock<\/summary>/);
  const unlinked=await (await request('/entries/new/E1?site=Jayant','c')).text();
  const unlinkedId=unlinked.match(/id="entry-form" data-id="([a-f0-9-]+)"/)[1];
  const rejected=await request('/entries/record/'+unlinkedId,'c',{...body,actor:JSON.stringify(['unlinked','Jayant.entry-0'])});
  assert.equal(rejected.status,422);
  assert.match((await rejected.json()).error,/employee details from Pulse/);
});
