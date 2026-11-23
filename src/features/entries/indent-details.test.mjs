import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { openDieselDatabase } from '../../data/database.mjs';
import { createEntryStore } from './entry-store.mjs';
import { indentFinancialYear, requiredDate } from './indent-details.mjs';
import { entrySites, entrySiteDirectory, siteInitials } from './entry-sites.mjs';
import { detailPage } from './entry-page.mjs';
import { byId } from './catalog.mjs';
import { roleKey } from './review-masters.mjs';
import { validateFields } from './entry-rules.mjs';
import { entryCsvRows, entryExportRows } from './entry-register.mjs';

const actor=(site='Jayant')=>({site,id:'maker-'+site,profile:roleKey('Site In-charge')});

test('indent years roll over on 1 April and required days calculate across months and leap years',()=>{
  assert.equal(indentFinancialYear('2026-03-31'),'25-26');
  assert.equal(indentFinancialYear('2026-04-01'),'26-27');
  assert.equal(indentFinancialYear('2027-03-31'),'26-27');
  assert.equal(indentFinancialYear('2027-04-01'),'27-28');
  assert.equal(requiredDate('2026-11-30',2),'2026-12-02');
  assert.equal(requiredDate('2028-02-28',1),'2028-02-29');
  assert.equal(requiredDate('2026-11-23',0),'2026-11-23');
  for(const value of [-1,1.5,NaN,Infinity,3651]) assert.throws(()=>requiredDate('2026-11-23',value),/whole days/);
  for(const value of ['',-1,1.5,3651,'2026-12-01']) assert.throws(()=>validateFields(byId.E1,{litres:100,requiredBy:value}));
  assert.equal(validateFields(byId.E1,{litres:100,requiredBy:'2'}).requiredBy,2);
});

test('indent numbers are transactional, persistent, site-wise, and fiscal-year-wise',t=>{
  const db=openDieselDatabase(':memory:');t.after(()=>db.close());
  let store=createEntryStore(db);
  const write=(id,site,day,action='Submit',rev=0,extra={})=>store.write(id,actor(site),{
    type:'E1',day,action,rev,data:{litres:100,requiredBy:2,reason:'Operational demand'},...extra});
  const id=randomUUID(), token=randomUUID();
  assert.equal(write(id,'Jayant','2026-03-31','Save draft').number,'');
  const first=write(id,'Jayant','2026-03-31','Submit',1,{token});
  assert.equal(first.number,'CMLL/JOC/25-26/001');
  assert.equal(write(id,'Jayant','2026-03-31','Submit',1,{token}).number,first.number);
  assert.equal(write(randomUUID(),'Jayant','2026-04-01').number,'CMLL/JOC/26-27/001');
  assert.equal(write(randomUUID(),'Sasti','2026-04-01').number,'CMLL/SOC/26-27/001');
  assert.throws(()=>write(randomUUID(),'Jayant','2026-04-01','Submit',0,{data:{litres:0,requiredBy:2}}));
  store=createEntryStore(db);
  assert.equal(write(randomUUID(),'Jayant','2026-04-02').number,'CMLL/JOC/26-27/002');
  const returned=store.write(first.id,{id:'manager',site:'Jayant',profile:roleKey('Project Manager')},{action:'Return',rev:first.rev,reason:'Check quantity'});
  assert.equal(write(first.id,'Jayant','2026-03-31','Submit',returned.rev).number,first.number);
  assert.equal(new Set(entrySites.map(row=>siteInitials(row.site))).size,entrySites.length);
});

test('indent details show all site names while retaining assignment restrictions and master item details',()=>{
  const maker=actor();
  const doc={id:randomUUID(),type:'E1',site:maker.site,maker:maker.id,day:'2026-11-23',rev:0,status:'Draft',number:'',data:{requiredBy:3},result:{}};
  const meta={...byId.E1,indentItem:{code:'HSD',name:'Approved diesel',hsn:'00123456',unit:'L'}};
  const html=detailPage(maker,doc,[],[],null,meta);
  for(const row of entrySites) assert.ok(html.includes('>'+row.name+'</option>'));
  assert.match(html,/Item name<input type="text" readonly value="Approved diesel"/);
  assert.match(html,/HSN code<input type="text" readonly value="00123456"/);
  assert.match(html,/Unit<select name="unit"/);
  assert.match(html,/Date<input name="day" type="date"/);
  assert.match(html,/Required by \(days\)<input name="requiredBy" type="number" data-required="true" step="1" min="0" max="3650" value="3"/);
  assert.match(html,/form="indent-site-switch"/);
  const assigned={...maker,assignments:[{site:'Jayant',profile:maker.profile}]};
  assert.equal(entrySiteDirectory(assigned).filter(row=>row.allowed).length,1);
  assert.match(detailPage(assigned,doc,[],[],null,meta),/value="Sasti" disabled>Sasti OC/);
  const posted={...doc,status:'Awaiting approval',rev:1,number:'CMLL/JOC/26-27/001',indentItem:meta.indentItem};
  assert.match(detailPage(maker,posted,[],[],null,byId.E1),/HSN code<input type="text" readonly value="00123456"/);
  const legacy={...posted,number:'cmll/joc/26-27/001'};
  const legacyPage=detailPage(maker,legacy,[],[],null,meta);
  assert.match(legacyPage,/value="CMLL\/JOC\/26-27\/001"/);
  assert.doesNotMatch(legacyPage,/cmll\/joc/);
  assert.equal(entryCsvRows([legacy])[1][0],'CMLL/JOC/26-27/001');
  assert.equal(entryExportRows([legacy])[1][0],'CMLL/JOC/26-27/001');
  assert.equal(legacy.number,'cmll/joc/26-27/001');
});

test('legacy date indents retain their number and can still be approved',t=>{
  const db=openDieselDatabase(':memory:');t.after(()=>db.close());
  const store=createEntryStore(db),maker=actor();
  const doc=store.write(randomUUID(),maker,{type:'E1',day:'2026-11-01',rev:0,action:'Submit',data:{litres:100,requiredBy:2}});
  doc.data.requiredBy='2026-11-03';doc.number='E1-JAY-2026-0001';delete doc.result.requiredDate;
  db.prepare('UPDATE entry_review_docs SET document=? WHERE id=?').run(JSON.stringify(doc),doc.id);
  const approved=store.write(doc.id,{id:'manager',site:'Jayant',profile:roleKey('Project Manager')},{action:'Approve',rev:doc.rev});
  assert.equal(approved.stage,1);
  assert.equal(approved.number,doc.number);
  const editable=detailPage(maker,{...doc,status:'Returned'},[],[],null);
  assert.match(editable,/name="requiredBy"[^>]*value="2"/);
});
