import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../server.mjs';
import { openDieselDatabase } from '../../data/database.mjs';
import { createLocalWorkspace } from '../local-workspace/app.mjs';
import { openItemSubmissions } from '../masters/item-submissions.mjs';
import { masterDefinition, recordDraftScope } from '../masters/records-fields.mjs';
import { createMasterStore, readActiveMasters } from '../masters/records.mjs';
import { companyRecords } from '../company-records/company-records.mjs';
import { percentageValue } from './rules.mjs';
import workbook from './erp-tax-data.mjs';

const worksheets = [['gst-master', 'GST', 4], ['tax-master-tds', 'TDS', 3]];

test('separate tax schemas and imported values retain the workbook headings, rates and blanks', () => {
  for (const [slug, sheet, count] of worksheets) {
    assert.deepEqual(masterDefinition(slug).fields.map(field => field.key), workbook[sheet].headers);
    const records = companyRecords(slug);
    assert.equal(records.length, count);
    assert.equal(new Set(records.map(record => record.id)).size, count);
    for (const source of workbook[sheet].rows) {
      const code = source[masterDefinition(slug).codeField];
      const record = records.find(record => record.code === code);
      assert.deepEqual(record.values, source);
      assert.equal(record.status, 'imported');
      assert.equal(record.values.Status, 'Active');
    }
  }
  const gst = companyRecords('gst-master').find(record => record.code === 'RCM_5_INTRA').values;
  assert.equal(gst.CGST_Rate, '2.5%');
  assert.equal(gst.IGST_Rate, '0%');
  assert.equal(gst['GST Location'], 'CHP GST');
  assert.equal(gst['SAC/HSN CODE'], undefined);
  assert.equal(gst.Effective_TO, undefined);
  const tds = companyRecords('tax-master-tds').find(record => record.code === 'TDS_194Q_GOODS').values;
  assert.equal(tds['Standard_Rate_%'], '0.1%');
  assert.equal(tds.Single_Threshold_INR, '0');
  assert.equal(tds.Aggregate_Threshold_INR, '5000000');
  assert.equal(tds.TRACES_Code, '1034');
  for (const key of ['Effective From', 'Effective To', 'Attachment Notification upload']) assert.equal(tds[key], undefined);
  for (const invalid of ['-1%', '101%', 'abc', 'NaN', 'Infinity']) assert.equal(percentageValue(invalid), null);
});

test('signed-in Master Data exports each worksheet separately and supports editing an imported tax record', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'diesel-tax-workbook-'));
  const itemSubmissions = await openItemSubmissions(directory);
  const grant = 'u'.repeat(43);
  const app = createApp({ itemSubmissions,
    env: { WEBSITE_SITE_NAME:'diesel-test', DIESEL_PUBLIC_ORIGIN:'https://diesel.test', DIESEL_SSO_CLIENT_SECRET:'s'.repeat(43) },
    fetcher:async (_url, options) => JSON.parse(options.body).grant === grant
      ? Response.json({profile:{login:'tax-user',name:'Tax User'}}) : new Response(null,{status:401}) });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(directory,{recursive:true,force:true}); });
  const origin = 'http://127.0.0.1:' + server.address().port;
  const get = (path, cookie = grant) => fetch(origin+path,{redirect:'manual',headers:{cookie:'__Host-diesel_session='+cookie}});
  assert.equal((await get('/api/master-data/records?master=gst-master','x'.repeat(43))).status,401);
  for (const [slug, sheet, count] of worksheets) {
    const exported = await (await get('/api/master-data/records?master='+slug)).json();
    assert.deepEqual(exported.columns, workbook[sheet].headers);
    assert.equal(exported.records.length,count);
    assert.ok(exported.records.every(record => record.slug === slug));
    for (const record of exported.records) {
      const source = companyRecords(slug).find(source => source.id === record.id);
      assert.deepEqual(record.fields, workbook[sheet].headers.map(key => [key,source.values[key]??'']));
    }
    const form = await (await get('/records?master='+slug+'&new=1')).text();
    for (const field of masterDefinition(slug).fields) assert.ok(form.includes('name="'+field.key+'"'),field.key);
    const imported = exported.records[0];
    assert.equal((await get('/records?master='+slug+'&id='+imported.id)).status,200);
  }
  const source = companyRecords('tax-master-tds').find(record => record.code === 'TDS_194Q_GOODS');
  const response = await fetch(origin+'/api/masters/tax-master-tds/records/'+source.id, {
    method:'PUT',headers:{cookie:'__Host-diesel_session='+grant,Origin:'https://diesel.test','Content-Type':'application/json'},
    body:JSON.stringify({revision:1,reason:'Add effective date',scope:recordDraftScope({id:'tax-user'},'tax-master-tds'),
      values:{...source.values,'Effective From':'2026-11-23'}}),
  });
  assert.equal(response.status,200,await response.clone().text());
  const edited = await response.json();
  assert.equal(edited.values['Standard_Rate_%'],'0.1%');
  assert.equal(edited.values['Effective From'],'2026-11-23');
  const exported = await (await get('/api/master-data/records?master=tax-master-tds')).json();
  assert.equal(exported.records.length,3,'an edit replaces its source row without duplicating the workbook record');
});

test('local/shared tax forms save and reopen with workbook fields while legacy Entry settings retain their schema', async t => {
  const db = openDieselDatabase(':memory:');
  const server = createLocalWorkspace(db).listen(0,'127.0.0.1');
  await once(server,'listening');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); });
  const origin = 'http://127.0.0.1:'+server.address().port;
  for (const [slug, sheet, count] of worksheets) {
    const rows = await (await fetch(origin+'/api/master-data/records?master='+slug)).json();
    assert.equal(rows.records.length,count);
    assert.deepEqual(rows.columns,workbook[sheet].headers);
    const sourceForm = await fetch(origin+'/records?master='+slug+'&id='+rows.records[0].id);
    assert.equal(sourceForm.status,200);
    const values = {...workbook[sheet].rows[0],[masterDefinition(slug).codeField]:'LOCAL-'+sheet};
    const response = await fetch(origin+'/api/masters/'+slug+'/records',{method:'POST',
      headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({values})});
    assert.equal(response.status,201,await response.clone().text());
    const saved = await response.json();
    assert.deepEqual(saved.values,values);
    assert.equal(saved.status,'pending');
    const reopened = await (await fetch(origin+'/records?master='+slug+'&id='+saved.id)).text();
    assert.ok(reopened.includes('value="LOCAL-'+sheet+'"'));
  }
  assert.deepEqual(readActiveMasters(db,'Jayant',['gst-master','tax-master-tds']),{'gst-master':[],'tax-master-tds':[]});
  const legacyValues = Object.fromEntries(masterDefinition('gst-master',{'GST code':'OLD'}).fields
    .filter(field => field.required).map(field => [field.key,field.options?.[0]??(field.type==='number'?'18':field.type==='date'?'2025-01-01':'OLD')]));
  const store = createMasterStore(db,['gst-master']);
  const legacy = store.create('gst-master',{site:'Jayant',values:legacyValues},{id:'legacy-maker'});
  const form = await (await fetch(origin+'/records?master=gst-master&id='+legacy.id)).text();
  assert.ok(form.includes('name="GST rate (%)"'));
  assert.ok(!form.includes('name="Total_GST_Rate"'));
  assert.deepEqual(store.get('gst-master',legacy.id).values,legacyValues);
  const list = await (await fetch(origin+'/api/master-data/records?master=gst-master')).json();
  assert.equal(new Map(list.records.find(record => record.id === legacy.id).fields).get('Total_GST_Rate'),'18%');
});
