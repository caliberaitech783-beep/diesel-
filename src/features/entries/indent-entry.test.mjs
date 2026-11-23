import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { openDieselDatabase } from '../../data/database.mjs';
import { createEntryStore } from './entry-store.mjs';
import { createLocalWorkspace } from '../local-workspace/app.mjs';
import { indentLitres } from './indent-details.mjs';
import { roleKey } from './review-masters.mjs';

const maker={site:'Jayant',id:'maker',profile:roleKey('Site In-charge')};

test('opening an indent reserves a persistent draft number and saving keeps its number, unit and priority',t=>{
  const db=openDieselDatabase(':memory:');t.after(()=>db.close());
  let store=createEntryStore(db);
  const first=store.openIndent(maker),second=store.openIndent(maker);
  assert.equal(first.rev,1);assert.equal(first.status,'Draft');
  assert.match(first.number,/\/001$/);assert.match(second.number,/\/002$/);
  assert.deepEqual(first.data,{unit:'Litre',priority:'Normal'});
  assert.equal(store.read(first.id,maker.site).number,first.number);
  assert.throws(()=>store.openIndent({...maker,profile:roleKey('Project Manager')}),/initiator role/);
  store=createEntryStore(db);
  assert.match(store.openIndent(maker).number,/\/003$/);
  const saved=store.write(first.id,maker,{type:'E1',rev:first.rev,day:first.day,action:'Save indent',
    number:'FORGED',data:{litres:1.25,unit:'KL',priority:'Urgent',requiredBy:2}});
  assert.equal(saved.number,first.number);
  assert.equal(saved.data.litres,1.25);assert.equal(saved.data.unit,'KL');assert.equal(saved.data.priority,'Urgent');
  assert.equal(saved.result.litres,1250);assert.equal(saved.status,'Saved');
  assert.deepEqual(saved.result.approvals,[]);
  const revised=store.write(saved.id,maker,{rev:saved.rev,day:saved.day,action:'Save indent',
    data:{litres:1250,unit:'Litre',priority:'Normal',requiredBy:2}});
  assert.equal(revised.number,first.number);assert.equal(revised.result.litres,1250);
  for(const data of [{litres:1,unit:'Gallon',priority:'Normal'},{litres:1,unit:'KL',priority:'Immediate'}]) {
    assert.throws(()=>store.write(second.id,maker,{rev:second.rev,day:second.day,action:'Save indent',data:{...data,requiredBy:2}}),/Choose a listed/);
  }
});

test('KL and Litre use the same litre basis, including fractional quantities and legacy entries',()=>{
  assert.equal(indentLitres({litres:1.2345,unit:'KL'}),1234.5);
  assert.equal(indentLitres({litres:1234.5,unit:'Litre'}),1234.5);
  assert.equal(indentLitres({litres:500}),500);
  assert.equal(indentLitres({litres:0.123456}),0.123456);
  for(const data of [{litres:0},{litres:-1},{litres:NaN},{litres:1e12,unit:'KL'},{litres:10,unit:'Gallon'}]) assert.throws(()=>indentLitres(data));
});

test('new-entry navigation reserves unique numbers and the form follows the requested sequence',async t=>{
  const db=openDieselDatabase(':memory:');
  const server=createLocalWorkspace(db).listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();});
  const origin='http://127.0.0.1:'+server.address().port;
  const opens=await Promise.all([1,2].map(()=>fetch(origin+'/entries/new/E1',{redirect:'manual'})));
  for(const response of opens) assert.equal(response.status,303);
  const urls=opens.map(response=>response.headers.get('location'));
  assert.notEqual(urls[0],urls[1]);
  const pages=await Promise.all(urls.map(url=>fetch(origin+url).then(response=>response.text())));
  assert.match(pages[0],/cmll\/JOC\/\d{2}-\d{2}\/001/);
  assert.match(pages[1],/cmll\/JOC\/\d{2}-\d{2}\/002/);
  const html=pages[0];
  const labels=['Location</label>','Indent number<input','Date<input','Item name<input','HSN code<input','Quantity<input','Unit<select','Priority<select'];
  let prior=-1;
  for(const label of labels) { const at=html.indexOf(label);assert.ok(at>prior,label+' follows the preceding field');prior=at; }
  assert.match(html,/<option value="KL">KL<\/option>/);
  assert.match(html,/<option value="Litre" selected>Litre<\/option>/);
  assert.match(html,/<option value="Normal" selected>Normal<\/option>/);
  assert.match(html,/<option value="Urgent">Urgent<\/option>/);
  assert.equal(await (await fetch(origin+urls[0])).text(),html);
  assert.equal(createEntryStore(db).list('Jayant').length,2);
});
