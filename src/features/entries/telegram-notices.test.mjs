import assert from 'node:assert/strict';
import test from 'node:test';
import { openDieselDatabase } from '../../data/database.mjs';
import { createTelegramNotices, keyFigures, noticesFor } from './telegram-notices.mjs';

const order = { id:'po-1', type:'E2', site:'Jayant', maker:'buyer', role:'Procurement Executive', number:'PO/0007', status:'Awaiting approval', stage:0,
  data:{ type:'Bulk', supplier:'SUP', basis:'Ex-depot', kl:140 },
  result:{ depot:'Jamnagar', rate:148500, value:20790000, approvals:['Head – Procurement','CFO'], telegramAllowed:true } };

test('Telegram notices follow each approval step and stay silent without the Approval Limit Master setting', () => {
  assert.equal(keyFigures(order),'Bulk PO · SUP Jamnagar · Ex-depot · 140 KL × ₹1,48,500 = ₹2,07,90,000');
  assert.deepEqual(noticesFor(undefined,order,'Procurement Executive').map(notice => notice.role),['Head – Procurement']);
  const second = noticesFor(order,{...order,stage:1},'Head – Procurement');
  assert.deepEqual(second.map(notice => notice.role ?? 'maker'),['CFO','maker']);
  assert.match(second[0].text,/Your level 2 of 2\.$/);
  assert.match(second[1].text,/Approved by Head – Procurement\. Now with CFO\.$/);
  assert.deepEqual(noticesFor({...order,stage:1},{...order,stage:1,status:'Posted'},'CFO').map(notice => notice.text),
    ['Purchase order PO/0007 · Jayant\nFully approved by CFO.']);
  assert.deepEqual(noticesFor({...order,stage:1},{...order,stage:1,status:'Awaiting Treasury'},'CFO').map(notice => notice.role ?? 'maker'),['Treasury','maker']);
  assert.deepEqual(noticesFor(order,order,'Head – Procurement'),[]);
  assert.deepEqual(noticesFor(undefined,{...order,result:{...order.result,telegramAllowed:false}},'Procurement Executive'),[]);
  assert.deepEqual(noticesFor(undefined,{...order,status:'Draft',number:''},'Procurement Executive'),[]);
});

test('notices reach signed-in people with the role at the site, never the maker or the person acting', async t => {
  const db = openDieselDatabase(':memory:');
  t.after(() => db.close());
  const sent = [];
  const notices = createTelegramNotices(db,{ notify:async(contact,text,url)=>{ sent.push([contact.chatId,url]); }, entryUrl:doc=>'https://diesel.test/entries/record/'+doc.id });
  const person = (id,chatId,...grants) => ({ id, approvalContact:chatId&&{chatId}, assignments:grants.map(([site,role])=>({site,role})) });
  notices.remember(person('buyer','11',['Jayant','Procurement Executive'],['Jayant','Head – Procurement']));
  notices.remember(person('head','22',['Jayant','Head – Procurement']));
  notices.remember(person('head-sasti','33',['Sasti','Head – Procurement']));
  notices.remember(person('no-telegram',null,['Jayant','Head – Procurement']));
  notices.remember(person('cfo','44',['Jayant','CFO']));
  assert.deepEqual(notices.announce(undefined,order,{id:'buyer'},'Procurement Executive'),['head']);
  assert.deepEqual(notices.announce(order,{...order,stage:1},{id:'head'},'Head – Procurement'),['cfo','buyer']);
  notices.remember(person('cfo',null,['Jayant','CFO']));
  assert.deepEqual(notices.announce(order,{...order,stage:1},{id:'head'},'Head – Procurement'),['buyer']);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(sent[0],['22','https://diesel.test/entries/record/po-1']);
  assert.equal(sent.length,4);
});
