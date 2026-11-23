import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { read as readWorkbook, utils as workbookUtils } from 'xlsx';
import { createApp } from '../../server.mjs';
import { openDieselDatabase } from '../../data/database.mjs';
import { masterDefinition } from '../masters/records-fields.mjs';
import { createMasterStore } from '../masters/records.mjs';
import { syncPulseProjects } from '../masters/pulse-projects.mjs';
import { businessDay, dayBefore } from './entry-rules.mjs';
import { roleKey } from './review-masters.mjs';
import { createRemoteApproval } from './remote-approval.mjs';

test('Telegram site approval survives Pulse sign-in and requires the assigned reviewer, current policy and one SMS code', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'diesel-remote-approval-'));
  const masterDb = openDieselDatabase(':memory:');
  const origin = 'https://diesel.test';
  const site = 'Majri North', otherSite = 'Another Project';
  const day = businessDay();
  const year = Number(day.slice(0, 4)) - Number(day.slice(5, 7) < '04');
  assert.equal(syncPulseProjects(masterDb, [{ name: 'Test client', sites: [site,otherSite] }]).length,2);
  const masters = createMasterStore(masterDb, ['item-master','location-master','storage-location-master',
    'document-numbering-master','approval-limit-master','reason-code-master']);
  function master(kind, fields, scope = site) {
    const defaults = Object.fromEntries(masterDefinition(kind).fields.filter(field => field.required)
      .map(field => [field.key, field.options?.[0] ?? { number:'10', date:day, time:'06:00' }[field.type] ?? 'Test']));
    const record = masters.create(kind, { site:scope, values: { ...defaults, ...fields } }, { id: 'master-maker' });
    return masters.changeStatus(kind, record.id, record.revision, 'approve', { id: 'master-checker' });
  }
  master('item-master', { 'Item Code':'HSD', 'Density minimum (kg/m³)':'815', 'Density maximum (kg/m³)':'845' });
  master('location-master', { 'Location Code':'MN-1','Receipt scenario allowed':'UG tank' });
  master('location-master', { 'Location Code':'OTHER-1','Receipt scenario allowed':'UG tank' }, otherSite);
  master('storage-location-master', { 'Storage type':'Bowser', Location:'MN-1', 'Storage Loc Code':'MN-B',
    'Capacity (L)':'2000', 'Safe fill level (L)':'1500' });
  master('reason-code-master', { Code:'START', Description:'Start of operations',
    'Used for (rejection, shortage, variance, correction, override)':'Override','Evidence required':'No' });
  master('document-numbering-master', { Entry:'E1', Prefix:'IND', 'Financial year':year+'-'+String(year+1).slice(-2),
    'Next number':'1', 'Site-wise series (Y/N)':'Yes' });
  const telegramRule = master('approval-limit-master', { Entry:'E1', 'Initiator role':'Site In-charge',
    'Quantity or value slab':'All', 'Approver level 1 role':'Project Manager',
    'Approval on Telegram with OTP allowed (Y/N)':'Yes', 'Effective from':day });

  const contact = { telegramChatId:'1234567', mobile:'+919876543210' };
  const projectManager = { site, role:'Project Manager' };
  const profiles = {
    i:{ login:'maker', dieselEntryAccess:[{site,role:'Site In-charge'},projectManager], dieselApprovalContact:contact },
    r:{ login:'reviewer', dieselEntryAccess:[{site:otherSite,role:'Project Manager'},projectManager], dieselApprovalContact:contact },
    s:{ login:'second', dieselEntryAccess:[projectManager], dieselApprovalContact:{...contact,telegramChatId:'2345678'} },
    o:{ login:'other', dieselEntryAccess:[{site:otherSite,role:'Project Manager'}], dieselApprovalContact:contact },
    b:{ login:'bowser', dieselEntryAccess:[{site,role:'Bowser operator'}] },
    u:{ login:'unknown', dieselEntryAccess:[{site:'Unknown Site',role:'Project Manager'}], dieselApprovalContact:contact },
  };
  const delivered = [];
  const app = createApp({ env:{ WEBSITE_SITE_NAME:'diesel', DIESEL_PUBLIC_ORIGIN:origin, DIESEL_ENTRY_ACCESS_MODE:'site-stock',
    DIESEL_SSO_CLIENT_SECRET:'s'.repeat(43),DIESEL_TELEGRAM_BOT_TOKEN:'123:fake-token', DIESEL_FAST2SMS_API_KEY:'fake-sms' },
  entryReviewDirectory:directory, siteMasterDb:masterDb, fetcher:async(url, options)=>{
    url = new URL(url);
    const data = JSON.parse(options.body);
    if (url.pathname.endsWith('/exchange')) return Response.json({grant:'r'.repeat(43)});
    if (url.pathname.endsWith('/validate')) return Response.json({profile:profiles[data.grant[0]]});
    if (url.hostname === 'api.telegram.org') {
      assert.equal(url.pathname, '/bot123:fake-token/sendMessage');
      delivered.push({ channel:'telegram', data });
      return Response.json({ok:true});
    }
    assert.equal(url.href, 'https://www.fast2sms.com/dev/bulkV2');
    assert.equal(options.headers.authorization, 'fake-sms');
    delivered.push({ channel:'sms', data });
    return Response.json({return:true});
  } });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    masterDb.close();
    await rm(directory, { recursive:true, force:true });
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  function request(path, who, body, selection = '', headers = {}) {
    const cookie = [...(who ? ['__Host-diesel_session=' + who.repeat(43)] : []), ...(selection ? [selection] : [])].join('; ');
    return fetch(base+path, { redirect:'manual', method:body?'POST':'GET', headers:{ Origin:origin, cookie,
      'Content-Type':body instanceof URLSearchParams?'application/x-www-form-urlencoded':'application/json', ...headers },
    body:body instanceof URLSearchParams?body:body ? JSON.stringify(body) : undefined });
  }
  const key = role => site + '.' + roleKey(role);
  const context = (who, role = 'Project Manager') => JSON.stringify([profiles[who].login,key(role)]);
  const assign = async (who, role) => {
    const result = await request('/workspace/role',who,new URLSearchParams({assignment:key(role)}));
    assert.equal(result.status,303);
    return result.headers.get('set-cookie').split(';')[0];
  };
  const unassigned = await request('/entries','u');
  assert.equal(unassigned.status,200);
  assert.match(await unassigned.text(),/Trial workspace · sample data · not live records/);
  const reviewerSite = await assign('r','Project Manager');
  assert.match(reviewerSite,/Majri%20North/);
  const opening = '/entries/opening-stock';
  assert.equal((await request(opening,'i',new URLSearchParams({
    item:'HSD', measuredAt:dayBefore(day)+'T07:00', revision:'0', code:'MN-B', litres:'0',
  }))).status,303);
  assert.equal((await request(opening+'/approve','r',new URLSearchParams({revision:'1'}),reviewerSite)).status,303);
  async function submit() {
    const record = '/entries/record/' + randomUUID();
    const posted = await request(record,'i',{ actor:context('i','Site In-charge'), action:'Submit', type:'E1',
      day, data:{ litres:120,requiredBy:0,reason:'START' }, rev:0 });
    assert.equal(posted.status,200,await posted.text());
    return record;
  }

  const record = await submit();
  assert.equal((await request(record,'b')).status,404);
  assert.equal((await request('/entries/type/E1','b')).status,403);
  assert.doesNotMatch(await (await request('/entries/export.csv?type=E1','b')).text(),/cmll\/MN\//);
  const excel = await request('/entries/export.xlsx?type=E1&from='+day,'r',null,reviewerSite);
  assert.equal(excel.status,200);
  const workbook = readWorkbook(Buffer.from(await excel.arrayBuffer()));
  const rows = workbookUtils.sheet_to_json(workbook.Sheets['Diesel Entries']);
  assert.equal(rows.length,1);
  assert.match(rows[0].Document,/^cmll\/MN\/\d{2}-\d{2}\/001$/);
  assert.equal(rows[0].Site,site);
  assert.doesNotMatch(await (await request(record,'r',null,reviewerSite)).text(),/Review via Telegram/);
  assert.doesNotMatch(await (await request(record,'i')).text(),/Review via Telegram/);
  const invite = record + '/telegram';
  assert.equal((await request(invite,'i',{actor:context('i'),rev:1},await assign('i','Project Manager'))).status,422);
  assert.equal((await request(invite,'r',{actor:context('r'),rev:1},reviewerSite,{Origin:'https://other.test'})).status,403);
  assert.equal((await request(invite,'r',{actor:context('r'),rev:0},reviewerSite)).status,422);
  assert.equal((await request(invite,'r',{actor:context('r'),rev:1},reviewerSite)).status,200);
  assert.equal((await request(invite,'r',{actor:context('r'),rev:1},reviewerSite)).status,422);
  const [{ data:message }] = delivered;
  assert.equal(message.chat_id, contact.telegramChatId);
  const [approve, sendBack] = message.reply_markup.inline_keyboard[0].map(button => new URL(button.url).pathname);
  const redirect = await request(approve);
  assert.equal(redirect.status,303);
  const state = new URL(redirect.headers.get('location')).searchParams.get('state');
  const callback = await request('/api/sign-in/callback?' + new URLSearchParams({ state, code:'c'.repeat(43) }),
    null, null, '', {cookie:redirect.headers.get('set-cookie').split(';')[0]});
  assert.equal(callback.headers.get('location'),approve);
  assert.equal((await request(approve,'r')).status,403);
  assert.equal((await request(approve,'o')).status,403);
  assert.equal((await request(approve,'s')).status,403);
  const confirmPage = await request(approve,'r',null,reviewerSite);
  assert.equal(confirmPage.status,200);
  assert.match(await confirmPage.text(),/Send SMS code/);
  assert.equal((await request(approve+'/code','r',{actor:context('r')},reviewerSite)).status,200);
  const sms = delivered.at(-1).data;
  assert.equal(sms.numbers,contact.mobile.slice(3));
  assert.match(sms.variables_values,/^\d{6}$/);
  assert.equal((await request(approve+'/code','r',{actor:context('r')},reviewerSite)).status,422);
  const correct = {actor:context('r'),code:sms.variables_values};
  assert.equal((await request(sendBack,'r',{...correct,reason:'Wrong action'},reviewerSite)).status,422);
  const badCode = sms.variables_values === '000000' ? '000001' : '000000';
  assert.match(await (await request(approve,'r',{...correct,code:badCode},reviewerSite)).text(),/Incorrect SMS code/);
  profiles.r.dieselEntryAccess = [{site:otherSite,role:'Project Manager'}];
  assert.equal((await request(approve,'r',correct,reviewerSite)).status,403);
  profiles.r.dieselEntryAccess.push(projectManager);
  const result = await request(approve,'r',correct,reviewerSite);
  assert.equal(result.status,200,await result.clone().text());
  assert.equal((await result.json()).status,'Posted');
  assert.equal((await request(approve,'r',correct,reviewerSite)).status,422);
  assert.match(await (await request(record,'r',null,reviewerSite)).text(),/Approve · Telegram \/ SMS OTP/);

  const next = await submit();
  assert.equal((await request(next+'/telegram','s',{actor:context('s'),rev:1})).status,200);
  const returnLink = new URL(delivered.at(-1).data.reply_markup.inline_keyboard[0][1].url).pathname;
  assert.equal((await request(returnLink+'/code','s',{actor:context('s')})).status,200);
  const returnCode = delivered.at(-1).data.variables_values;
  assert.equal((await request(returnLink,'s',{actor:context('s'),code:returnCode})).status,422);
  assert.equal((await (await request(returnLink,'s',{actor:context('s'),code:returnCode,reason:'Review the site quantity'})).json()).status,'Returned');

  const last = await submit();
  const retired = masters.changeStatus(telegramRule.master,telegramRule.id,telegramRule.revision,'deactivate',
    {id:'master-maker'},'Withdraw Telegram permission');
  masters.changeStatus(retired.master,retired.id,retired.revision,'approve',{id:'master-checker'});
  assert.doesNotMatch(await (await request(last,'r',null,reviewerSite)).text(),/Review via Telegram/);
  assert.equal((await request(last+'/telegram','r',{actor:context('r'),rev:1},reviewerSite)).status,422);
  assert.equal(delivered.length,4);
});

test('remote approval codes expire after five minutes and lock the link after three incorrect guesses', async t => {
  const db = openDieselDatabase(':memory:');
  t.after(() => db.close());
  const minute = 60_000;
  let time = 0, ticket, code;
  const actor = { id:'checker', site:'Jayant', actionContext:'checker at Jayant', profile:roleKey('Project Manager'),
    approvalContact:{chatId:'1',mobile:'+919876543210'} };
  const doc = { id:'doc', site:actor.site, stage:0, rev:1, status:'Awaiting approval', maker:'maker',
    result:{telegramAllowed:true,approvals:['Project Manager']} };
  const approval = createRemoteApproval(db, { read:() => doc, write:()=>assert.fail('An invalid code must not post an entry') }, {
    secret:'local-test', now:()=>time, policyFor:()=>({approvals:()=>doc.result}),
    delivery:{ async telegram(_contact,_doc,key) { ticket=key; }, async sms(_contact,sent) { code=sent; } },
  });
  await approval.invite(doc.id,actor,doc.rev);
  await approval.requestCode(ticket,'approve',actor);
  time = 5*minute;
  assert.throws(() => approval.confirm(ticket,'approve',actor,{code}), /Request an SMS code/);
  await approval.requestCode(ticket,'approve',actor);
  const badCode = code === '000000' ? '000001' : '000000';
  for (let i=0; i<3; i++) assert.throws(() => approval.confirm(ticket,'approve',actor,{code:badCode}), /Incorrect SMS code/);
  await assert.rejects(approval.requestCode(ticket,'approve',actor), /Too many incorrect codes/);
  assert.throws(() => approval.confirm(ticket,'approve',actor,{code}), /Too many incorrect codes/);
  await assert.rejects(approval.invite(doc.id,actor,doc.rev), /recently or locked/);
  time = 15*minute;
  assert.throws(() => approval.review(ticket,'approve',actor), /expired/);
  await approval.invite(doc.id,actor,doc.rev);
});
