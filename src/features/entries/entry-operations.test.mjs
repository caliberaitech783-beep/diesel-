import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import test from 'node:test';
import { openDieselDatabase } from '../../data/database.mjs';
import { createMasterStore } from '../masters/records.mjs';
import { createLocalWorkspace } from '../local-workspace/app.mjs';
import { entryAlerts } from './entry-alerts.mjs';
import { entryPolicy, policyMasters } from './entry-policy.mjs';
import { filterRegister, registerFilters } from './entry-register.mjs';
import { businessDay } from './entry-rules.mjs';
import { createEntryStore } from './entry-store.mjs';
import { invoiceFields } from './invoice-ocr.mjs';
import { roleKey, review } from './review-masters.mjs';
import { byId } from './catalog.mjs';
import { formSteps } from './phone-form-steps.mjs';

test('approved master records change entry approval steps and limits for their site only', async t => {
  const db = openDieselDatabase(':memory:');
  const server = createLocalWorkspace(db).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); });
  const origin = 'http://127.0.0.1:' + server.address().port;
  const master = createMasterStore(db, policyMasters);
  const entries = createEntryStore(db);
  const maker = { id:'settings-maker' }, checker = { id:'settings-checker' };
  const day = businessDay();
  const rule = master.create('approval-limit-master', { site:'Jayant', values:{
    Entry:'E1', 'Initiator role':'Site In-charge', 'Quantity or value slab':'Above 1,000 L',
    'Approver level 1 role':'Project Manager', 'Approver level 2 role':'Head of Procurement',
    'Approver level 3 role (e.g. Director / CMD)':'Director',
    'Approval on Telegram with OTP allowed (Y/N)':'No', 'Effective from':day,
  } }, maker);
  const tolerance = master.create('tolerance-and-alert-master', { site:'Jayant', values:{
    Alert:'Transit shortage', Limit:'1%',
    'First owner (role)':'Site In-charge', 'Escalate to (role)':'Project Manager',
    'Escalate after (hours)':'2', 'Channel (app, e-mail, Telegram)':'App',
  } }, maker);
  function request(path, data, cookie) {
    return fetch(origin + path, { method:data ? 'POST' : 'GET', redirect:'manual', headers:{
      Origin:origin, 'Content-Type':data instanceof URLSearchParams ? 'application/x-www-form-urlencoded' : 'application/json',
      ...(cookie ? { cookie } : {}),
    }, body:data instanceof URLSearchParams ? data : JSON.stringify(data) });
  }
  async function switchRole(role, site) {
    const response = await request('/workspace/role',new URLSearchParams({ role:roleKey(role), site }));
    assert.equal(response.status,303);
    return response.headers.get('set-cookie').split(';')[0];
  }
  async function submit(type, data, role, site='Jayant') {
    const id=randomUUID(), cookie=await switchRole(role,site);
    const posted=await request('/entries/record/'+id,{ type,data,day,action:'Submit',rev:0,actor:site+'-'+roleKey(role) },cookie);
    assert.equal(posted.status,200,await posted.text());
    return entries.read(id, site);
  }
  const old = await submit('E1',{litres:1001,requiredBy:day},'Site In-charge');
  assert.equal(old.result.approvals.length,2);
  master.changeStatus(rule.master,rule.id,rule.revision,'approve',checker);
  master.changeStatus(tolerance.master,tolerance.id,tolerance.revision,'approve',checker);
  const newRule = await submit('E1',{litres:1001,requiredBy:day},'Site In-charge');
  assert.deepEqual(newRule.result.approvals,['Project Manager','Head – Procurement','Director / CMD']);
  assert.equal(newRule.result.telegramAllowed,false);
  const other = await submit('E1',{litres:1001,requiredBy:day},'Site In-charge','Sasti');
  assert.equal(other.result.approvals.length,2);
  let indent = await submit('E1',{litres:1000,requiredBy:day},'Site In-charge');
  for (const role of indent.result.approvals) indent = entries.write(indent.id,{ id:'Jayant-'+roleKey(role),site:'Jayant',profile:roleKey(role) },
    { action:'Approve',rev:indent.rev });
  const order = await submit('E2',{ indent:indent.id, type:'Bulk', supplier:review.supplier, depot:review.depot,
    basis:'Delivered', kl:1, terms:'Advance', tolerance:0.8 },'Procurement Executive');
  assert.equal(order.result.transitTolerance,0.8);
  const csv = await (await request('/entries/export.csv?to=2000-01-01')).text();
  assert.doesNotMatch(csv,/E1-JAY/);
});

test('Head Office filters include the linked tanker and send overdue notices to the configured roles', () => {
  const stamp = '2026-11-01T00:00:00Z';
  const gate = { id:'gate', type:'E5', status:'Posted', site:'Jayant', day:'2026-11-01', updated:stamp,
    number:'E5-1', data:{ truck:'MH12AA1234', scenario:'Direct to bowsers' }, result:{} };
  const inspection = { id:'inspection', type:'E6', status:'Posted', site:'Jayant', day:'2026-11-02', updated:stamp,
    number:'E6-1', data:{ gate:gate.id }, result:{ shortage:0, invoiceLitres:1000 } };
  const rows=[gate,inspection];
  assert.deepEqual(filterRegister(rows,undefined,registerFilters({truck:'mh12aa1234',from:'2026-11-02'})),[inspection]);
  const policy=entryPolicy({'tolerance-and-alert-master':[{site:'Jayant',values:{
    Alert:'Tanker empty overdue', Limit:'2h', 'First owner (role)':'Site Store',
    'Escalate to (role)':'Project Manager', 'Escalate after (hours)': '1', 'Channel (app, e-mail, Telegram)':'App',
  }}]},'Jayant','2026-11-01');
  const alerts=(role,hour)=>entryAlerts(rows,{ site:'Jayant',profile:roleKey(role) },policy, Date.parse(stamp)+hour*3600000);
  assert.deepEqual(alerts('Site Store',1),[]);
  assert.equal(alerts('Site Store',2)[0].number,'E5-1');
  assert.deepEqual(alerts('Project Manager',2),[]);
  assert.equal(alerts('Project Manager',3)[0].escalation,'Project Manager');
});

test('phone steps retain every entry field and invoice extraction ignores unlabelled values', () => {
  for (const type of ['E5','E6','E10A','E11']) {
    assert.deepEqual(formSteps(byId[type]).flatMap(step=>step.fields.map(field=>field.key)).sort(),
      byId[type].fields.map(field=>field.key).sort());
  }
  assert.deepEqual(invoiceFields('Invoice No: INV-304\nInvoice Date: 18/11/2026\nE-Way Bill No 123456789012\nQuantity: 12,400 L\nTruck No: MH 12 AA 1234'),{
    invoice:'INV-304',invoiceDate:'2026-11-18',eway:'123456789012',litres:'12400',truck:'MH12AA1234',
  });
  assert.deepEqual(invoiceFields('18/11/26\n123456789012\n1250'),{});
});
