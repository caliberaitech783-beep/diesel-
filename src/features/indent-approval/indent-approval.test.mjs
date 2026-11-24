import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import express from 'express';
import { openDieselDatabase } from '../../data/database.mjs';
import { createEntriesRouter } from '../entries/routes.mjs';
import { businessDay } from '../entries/entry-rules.mjs';
import { roleKey } from '../entries/review-masters.mjs';
import { registerIndentApproval, indentWebhookPath } from './approval-routes.mjs';
import { createIndentApprovalStore, phoneKey } from './approval-store.mjs';
import { createIndentApproval, indentSummary } from './indent-approval.mjs';
import { createTelegram } from './telegram.mjs';

const token = '9000000001:' + 'A'.repeat(35);
const doc = (overrides = {}) => ({ id: randomUUID(), type: 'E1', rev: 1, number: 'cmll/joc/ind/26-27/001', site: 'Jayant OC', day: '2026-11-24',
  requester: { name: 'Ravi Kumar', empId: 'E001' }, data: { litres: 12000, priority: 'Urgent', requiredBy: 2, reason: 'Stock below minimum', remarks: 'Night shift' },
  result: {}, ...overrides });

// A Telegram that records every call and hands out message ids.
function fakeTelegram() {
  const calls = [];
  let nextId = 100;
  return { calls, webhookSecret: 'secret',
    send: async (method, body) => { const result = method === 'sendMessage' ? { message_id: nextId++ } : true; calls.push({ method, ...body, result }); return result; },
    sendDocument: async message => { calls.push({ method: 'sendDocument', ...message }); return { message_id: nextId++ }; },
    take() { return calls.splice(0); } };
}
function setup() {
  const db = new DatabaseSync(':memory:'), store = createIndentApprovalStore(db), telegram = fakeTelegram();
  let clock = Date.parse('2026-11-24T07:00:00Z');
  const approval = createIndentApproval({ store, telegram, now: () => new Date(clock += 60_000).toISOString() });
  store.addApprover({ name: 'Anil Sharma', phone: '+91 98765 43210', pulseLogin: 'anil' }, 'admin', '2026-11-24T06:00:00Z');
  store.addApprover({ name: 'Bina Rao', phone: '9123456780', pulseLogin: 'bina.rao' }, 'admin', '2026-11-24T06:00:00Z');
  const contact = (chat, phone, owner = chat) => approval.update({ message: { chat: { id: chat, type: 'private' }, from: { id: chat }, contact: { phone_number: phone, user_id: owner } } });
  const press = (chat, action, id, messageId = 1) => approval.update({ callback_query: { id: 'q', data: 'indent:' + action + ':' + id, message: { chat: { id: chat }, message_id: messageId } } });
  return { db, store, telegram, approval, contact, press };
}

test('the approver list takes a name, an Indian mobile and a Pulse username, once per mobile', () => {
  const store = createIndentApprovalStore(new DatabaseSync(':memory:'));
  const add = person => store.addApprover(person, 'admin', '2026-11-24T06:00:00Z');
  add({ name: 'Anil Sharma', phone: '+91-98765 43210', pulseLogin: 'anil' });
  assert.equal(phoneKey('+91 98765-43210'), '9876543210');
  assert.throws(() => add({ name: 'Other', phone: '09876543210', pulseLogin: 'other' }), /already on the list/);
  assert.throws(() => add({ name: 'X', phone: '9123456780', pulseLogin: 'x1' }), /name/);
  assert.throws(() => add({ name: 'Bina', phone: '12345', pulseLogin: 'bina' }), /10-digit/);
  assert.throws(() => add({ name: 'Bina', phone: '9123456780', pulseLogin: '' }), /Pulse username/);
  assert.deepEqual(store.approvers().map(person => [person.name, person.phone, person.pulse_login, person.chat_id]), [['Anil Sharma', '9876543210', 'anil', null]]);
  assert.equal(store.removeApprover(store.approvers()[0].id), true);
  assert.deepEqual(store.approvers(), []);
});

test('a person links Telegram only by sharing their own listed mobile number', async () => {
  const { store, telegram, approval, contact } = setup();
  await approval.update({ message: { chat: { id: 11, type: 'private' }, from: { id: 11 }, text: '/start' } });
  assert.equal(telegram.take()[0].reply_markup.keyboard[0][0].request_contact, true);
  await contact(11, '+919876543210', 99);
  assert.match(telegram.take()[0].text, /your own number/);
  await contact(12, '+917000000000');
  assert.match(telegram.take()[0].text, /not on the Diesel indent approver list/);
  await contact(11, '+919876543210');
  assert.match(telegram.take()[0].text, /^Linked, Anil Sharma/);
  assert.equal(store.approverByChat(11).name, 'Anil Sharma');
  await approval.update({ message: { chat: { id: -500, type: 'group' }, from: { id: 11 }, text: '/start' } });
  assert.deepEqual(telegram.take(), [], 'the bot answers in private chats only');
  assert.equal(store.linkedApprovers().length, 1);
});

test('a saved indent goes to every linked approver as a PDF, and the first decision stands', async () => {
  const { store, telegram, approval, contact, press } = setup();
  const indent = doc();
  assert.equal(await approval.requested(indent), 0, 'nobody has linked Telegram yet');
  assert.deepEqual(approval.decision(indent.id), { status: 'pending', label: 'Awaiting approval', detail: 'Not delivered yet: no approver has linked Telegram' });
  await contact(11, '9876543210'); await contact(22, '9123456780'); telegram.take();

  assert.equal(await approval.requested(indent), 2);
  const sent = telegram.take().filter(call => call.method === 'sendDocument');
  assert.deepEqual(sent.map(call => call.chatId).sort(), ['11', '22']);
  assert.equal(sent[0].fileName, 'CMLL-JOC-IND-26-27-001.pdf');
  assert.equal(Buffer.from(sent[0].bytes).subarray(0, 5).toString(), '%PDF-');
  assert.equal(sent[0].caption, 'Diesel indent CMLL/JOC/IND/26-27/001\nSite: Jayant OC\nQuantity: 12,000 litres · Urgent\nRequired: 26/11/2026\nRequested by: Ravi Kumar · E001');
  assert.deepEqual(sent[0].keyboard[0].map(button => button.callback_data), ['indent:approve:' + indent.id, 'indent:decline:' + indent.id]);
  assert.equal(approval.decision(indent.id).detail, 'Sent to 2 approvers on Telegram');

  await press(33, 'approve', indent.id);
  assert.match(telegram.take()[0].text, /not on the Diesel indent approver list/);
  assert.equal(store.request(indent.id).status, 'pending');

  await press(22, 'approve', indent.id);
  const closed = telegram.take();
  const edits = closed.filter(call => call.method === 'editMessageCaption');
  assert.equal(edits.length, 2, 'both copies lose their buttons');
  assert.ok(edits.every(call => /✅ Approved by Bina Rao · 24 Nov 2026/.test(call.caption) && call.reply_markup.inline_keyboard.length === 0));
  assert.equal(closed.find(call => call.method === 'answerCallbackQuery').text, 'Approved.');
  assert.equal(approval.decision(indent.id).label, 'Approved');
  assert.match(approval.decision(indent.id).detail, /^by Bina Rao · /);

  await press(11, 'decline', indent.id);
  assert.equal(telegram.take().find(call => call.method === 'answerCallbackQuery').text, 'Already approved by Bina Rao.');
  assert.equal(store.request(indent.id).status, 'approved');
  await press(11, 'approve', randomUUID());
  assert.match(telegram.take()[0].text, /no longer waiting/);
});

test('a decline may carry a reason, and an edited indent asks again', async () => {
  const { store, telegram, approval, contact, press } = setup();
  await contact(11, '9876543210'); await contact(22, '9123456780');
  const indent = doc();
  await approval.requested(indent); telegram.take();
  await press(11, 'decline', indent.id);
  const prompt = telegram.take().find(call => call.method === 'sendMessage');
  assert.match(prompt.text, /Reply to this message with a reason, or ignore it/);
  assert.equal(prompt.reply_markup.force_reply, true);
  assert.equal(approval.decision(indent.id).label, 'Declined');

  const reply = (chat, text, to) => approval.update({ message: { chat: { id: chat, type: 'private' }, from: { id: chat }, text, reply_to_message: { message_id: to } } });
  const { message_id } = prompt.result;
  await reply(22, 'Not mine to give', message_id);
  assert.equal(store.request(indent.id).reason, null, 'only the person who declined can give the reason');
  telegram.take();
  await reply(11, '  Tanker already ordered  ', message_id);
  const after = telegram.take();
  assert.equal(store.request(indent.id).reason, 'Tanker already ordered');
  assert.ok(after.filter(call => call.method === 'editMessageCaption').every(call => /Reason: Tanker already ordered/.test(call.caption)));
  assert.match(approval.decision(indent.id).detail, /Tanker already ordered$/);

  assert.equal(await approval.requested({ ...indent, rev: 2, data: { ...indent.data, litres: 9000 } }), 2);
  const again = telegram.take();
  assert.equal(again.filter(call => call.method === 'editMessageCaption' && /was edited/.test(call.caption)).length, 2);
  assert.match(again.find(call => call.method === 'sendDocument').caption, /9,000 litres/);
  assert.deepEqual([store.request(indent.id).status, store.request(indent.id).rev, store.request(indent.id).reason], ['pending', 2, null]);
});

test('the indent summary reads older and incomplete indents without failing', () => {
  const summary = indentSummary(doc({ requester: undefined, requestedBy: 'maker', data: { litres: 2, unit: 'KL', requiredBy: '2026-11-30' } }));
  assert.match(summary.caption, /Quantity: 2,000 litres · Normal\nRequired: 30\/11\/2026\nRequested by: maker/);
  assert.equal(new Map(summary.rows).get('Reason'), '');
});

test('administrators manage approvers, Telegram calls need the bot secret, and Entry shows the outcome', async t => {
  const shared = new DatabaseSync(':memory:'), entryDb = openDieselDatabase(':memory:');
  const telegramCalls = [];
  const fetcher = async (url, options) => {
    const method = String(url).split('/').pop();
    telegramCalls.push({ method, body: typeof options.body === 'string' ? JSON.parse(options.body) : Object.fromEntries(options.body) });
    return Response.json({ ok: true, result: method === 'getMe' ? { username: 'dieselindent_bot' } : { message_id: 500 + telegramCalls.length } });
  };
  const app = express();
  let login = 'admin';
  const approval = registerIndentApproval(app, { db: shared, fetcher, publicOrigin: 'https://diesel.test', env: { DIESEL_INDENT_BOT_TOKEN: token },
    getProfile: async () => login ? { login, name: login } : null, isAdmin: profile => profile.login === 'admin', startSignIn: response => response.redirect(303, '/pulse') });
  const maker = { id: 'maker', site: 'Jayant', profile: roleKey('Site In-charge') };
  app.use('/entries', (request, _response, next) => { request.dieselActor = { ...maker }; next(); }, createEntriesRouter(entryDb, { indentApproval: approval }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); shared.close(); entryDb.close(); });
  const origin = 'http://127.0.0.1:' + server.address().port;
  const post = (path, body, headers = {}) => fetch(origin + path, { method: 'POST', redirect: 'manual', body, headers });
  const formPost = (path, fields, from = 'https://diesel.test') => post(path, new URLSearchParams(fields), { Origin: from });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(telegramCalls.find(call => call.method === 'setWebhook').body.allowed_updates, ['message', 'callback_query']);
  assert.equal(telegramCalls.find(call => call.method === 'setWebhook').body.url, 'https://diesel.test' + indentWebhookPath);

  assert.match(await (await fetch(origin + '/indent-approvers')).text(), /Telegram bot connected: <strong>@dieselindent_bot/);
  assert.equal((await formPost('/indent-approvers', { name: 'Anil Sharma', phone: '9876543210', pulseLogin: 'anil' }, 'https://elsewhere.test')).status, 403);
  assert.equal((await formPost('/indent-approvers', { name: 'Anil Sharma', phone: '9876543210', pulseLogin: 'anil' })).status, 303);
  const invalid = await formPost('/indent-approvers', { name: 'Anil Sharma', phone: '9876543210', pulseLogin: 'anil' });
  assert.equal(invalid.status, 422);
  assert.match(await invalid.text(), /already on the list/);
  assert.match(await (await fetch(origin + '/indent-approvers')).text(), /Anil Sharma<\/td><td>9876543210<\/td><td>anil<\/td>\s*<td><span class="waiting">/);
  login = 'someone';
  assert.equal((await fetch(origin + '/indent-approvers')).status, 403);
  assert.equal((await formPost('/indent-approvers', { name: 'Self Added', phone: '9000000009', pulseLogin: 'someone' })).status, 403);
  login = '';
  assert.equal((await fetch(origin + '/indent-approvers', { redirect: 'manual' })).status, 303);
  login = 'admin';

  const secret = createTelegram(token).webhookSecret;
  const hook = (update, given = secret) => post(indentWebhookPath, JSON.stringify(update), { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': given });
  assert.equal((await hook({ message: { chat: { id: 11, type: 'private' }, from: { id: 11 }, contact: { phone_number: '9876543210', user_id: 11 } } }, 'wrong')).status, 403);
  assert.equal((await hook({ message: { chat: { id: 11, type: 'private' }, from: { id: 11 }, contact: { phone_number: '9876543210', user_id: 11 } } })).status, 200);
  assert.match(await (await fetch(origin + '/indent-approvers')).text(), /<span class="linked">Linked<\/span>/);
  assert.equal((await hook({ unexpected: true })).status, 200);

  const id = randomUUID(), headers = { 'Content-Type': 'application/json' };
  const save = (rev, litres) => fetch(origin + '/entries/record/' + id, { method: 'POST', headers,
    body: JSON.stringify({ actor: 'maker', type: 'E1', rev, day: businessDay(), action: 'Save indent', site: 'Jayant', data: { litres, requiredBy: 3 } }) });
  telegramCalls.length = 0;
  assert.equal((await save(0, 100)).status, 200);
  await new Promise(resolve => setTimeout(resolve, 150));
  const document = telegramCalls.find(call => call.method === 'sendDocument');
  assert.equal(document.body.chat_id, '11');
  assert.match(document.body.caption, /^Diesel indent CMLL\/JOC\/IND\/\d\d-\d\d\/001\nSite: Jayant\nQuantity: 100 litres/);
  assert.ok(document.body.document instanceof Blob);

  const list = await (await fetch(origin + '/entries/type/E1')).text();
  assert.match(list, /<span class="status-pill waiting">Awaiting approval<\/span>\s*<small class="approval-detail">Sent to 1 approver on Telegram<\/small> <a class="approval-edit" href="\/entries\/record\/[a-f0-9-]+">Edit<\/a>/);
  await hook({ callback_query: { id: 'q1', data: 'indent:decline:' + id, message: { chat: { id: 11 }, message_id: 1 } } });
  assert.match(await (await fetch(origin + '/entries/type/E1')).text(), /<span class="status-pill returned">Declined<\/span>\s*<small class="approval-detail">by Anil Sharma · /);
  assert.match(await (await fetch(origin + '/entries/record/' + id)).text(), /<span class="indent-approval is-declined"><strong>Declined<\/strong> by Anil Sharma/);
  assert.equal(approval.status().failures.length, 0);
});

test('without a bot token nothing is sent and indents stay Saved', async () => {
  const app = express(), shared = new DatabaseSync(':memory:');
  const approval = registerIndentApproval(app, { db: shared, env: {}, publicOrigin: 'https://diesel.test', getProfile: async () => null, isAdmin: () => false,
    startSignIn: () => {}, fetcher: async () => { throw Error('Telegram must not be called'); } });
  const indent = doc();
  assert.equal(await approval.requested(indent), null);
  assert.equal(approval.decision(indent.id), null);
  assert.equal(approval.status().bot.configured, false);
});
