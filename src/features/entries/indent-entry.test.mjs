import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { openDieselDatabase } from '../../data/database.mjs';
import { createEntryStore } from './entry-store.mjs';
import { createLocalWorkspace } from '../local-workspace/app.mjs';
import { indentLitres } from './indent-details.mjs';
import { roleKey } from './review-masters.mjs';

const maker={site:'Jayant',id:'maker',profile:roleKey('Site In-charge'),employee:{empId:'E001',name:'Test requester'}};

test('opening an indent does not persist or reserve a number and saving keeps its number, unit and priority',t=>{
  const db=openDieselDatabase(':memory:');t.after(()=>db.close());
  let store=createEntryStore(db);
  const first=store.openIndent(maker),second=store.openIndent(maker);
  assert.equal(first.rev,0);assert.equal(first.status,'Draft');
  assert.equal(first.number,'');assert.equal(second.number,'');
  assert.equal(store.list(maker.site).length,0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM entry_review_numbers').get().n,0);
  assert.throws(()=>store.read(first.id,maker.site),/unavailable/);
  assert.deepEqual(first.data,{unit:'Litre',priority:'Normal'});
  assert.throws(()=>store.openIndent({...maker,profile:roleKey('Project Manager')}),/initiator role/);
  store=createEntryStore(db);
  assert.equal(store.openIndent(maker).number,'');
  const saved=store.write(first.id,maker,{type:'E1',rev:first.rev,day:first.day,action:'Save indent',
    number:'FORGED',data:{litres:1250,unit:'Litre',priority:'Urgent',requiredBy:2,sanctionQuantity:900}});
  assert.match(saved.number,/\/001$/);
  assert.deepEqual(saved.requester,maker.employee);
  assert.equal(saved.data.litres,1250);assert.equal(saved.data.unit,'Litre');assert.equal(saved.data.priority,'Urgent');
  assert.equal(saved.data.sanctionQuantity,undefined);
  assert.equal(saved.result.litres,1250);assert.equal(saved.status,'Saved');
  assert.deepEqual(saved.result.approvals,[]);
  const revised=store.write(saved.id,maker,{rev:saved.rev,day:saved.day,action:'Save indent',
    data:{litres:1250,unit:'Litre',priority:'Normal',requiredBy:2}});
  assert.equal(revised.number,saved.number);assert.equal(revised.result.litres,1250);
  for(const data of [{litres:1,unit:'Gallon',priority:'Normal'},{litres:1,unit:'KL',priority:'Normal'},{litres:1,unit:'Litre',priority:'Immediate'}]) {
    assert.throws(()=>store.write(second.id,maker,{type:'E1',rev:second.rev,day:second.day,action:'Save indent',data:{...data,requiredBy:2}}),/Unit must be Litre|Choose a listed/);
  }
  assert.equal(store.list(maker.site).length,1);
  const next=store.write(second.id,maker,{type:'E1',rev:0,day:second.day,action:'Save indent',data:{litres:100,requiredBy:2,reason:'Operational demand'}});
  assert.match(next.number,/\/002$/);
});

test('KL and Litre use the same litre basis, including fractional quantities and legacy entries',()=>{
  assert.equal(indentLitres({litres:1.2345,unit:'KL'}),1234.5);
  assert.equal(indentLitres({litres:1234.5,unit:'Litre'}),1234.5);
  assert.equal(indentLitres({litres:500}),500);
  assert.equal(indentLitres({litres:0.123456}),0.123456);
  for(const data of [{litres:0},{litres:-1},{litres:NaN},{litres:1e12,unit:'KL'},{litres:10,unit:'Gallon'}]) assert.throws(()=>indentLitres(data));
});

test('opening or refreshing a new indent keeps location and number blank without creating entries',async t=>{
  const db=openDieselDatabase(':memory:');
  const server=createLocalWorkspace(db).listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();});
  const origin='http://127.0.0.1:'+server.address().port;
  const opens=await Promise.all([1,2].map(()=>fetch(origin+'/entries/new/E1',{redirect:'manual'})));
  for(const response of opens) assert.equal(response.status,200);
  const pages=await Promise.all(opens.map(response=>response.text()));
  for(const html of pages) {
    assert.match(html,/Indent number<input type="text" readonly value="" placeholder="Generated after saving"/);
    assert.match(html,/<option value="" selected>Select a location<\/option>/);
    assert.match(html,/<details class="indent-secondary" open><summary>Site stock<\/summary><p>Select a location to see its stock\.<\/p>/);
    assert.doesNotMatch(html,/value="Jayant" selected|HSN code|CMLL\/JOC\/IND/);
  }
  const html=pages[0];
  const labels=['Indent number<input','Indent date<input','Site / Location<select','Item name<input','Quantity<input','Sanction quantity<input','Unit<input','Priority<select','Required by (days)<input'];
  let prior=-1;
  for(const label of labels) { const at=html.indexOf(label);assert.ok(at>prior,label+' follows the preceding field');prior=at; }
  assert.doesNotMatch(html,/<option value="KL"|<select name="unit"/);
  assert.match(html,/Unit<input name="unit" type="text" readonly value="Litre"/);
  assert.match(html,/Sanction quantity<input type="text" readonly value=""/);
  assert.match(html,/<option value="Normal" selected>Normal<\/option>/);
  assert.match(html,/<option value="Urgent">Urgent<\/option>/);
  assert.equal(createEntryStore(db).list('Jayant').length,0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM entry_review_numbers').get().n,0);
});
