import { formatIndentDate, formatIndentNumber, indentDueDate, indentFormData } from '../entries/indent-details.mjs';
import { indentPdf } from './indent-pdf.mjs';

const istTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
const when = stamp => istTime.format(new Date(stamp)) + ' IST';
const buttons = doc => [[{ text: '✅ Approve', callback_data: 'indent:approve:' + doc }, { text: '❌ Decline', callback_data: 'indent:decline:' + doc }]];

// The indent as the rows of its PDF and the caption under it.
export function indentSummary(doc) {
  const data = indentFormData(doc), number = formatIndentNumber(doc.number);
  const requester = doc.requester ? doc.requester.name + ' · ' + doc.requester.empId : doc.requestedBy ?? '';
  const litres = Number(data.litres);
  const quantity = Number.isFinite(litres) ? litres.toLocaleString('en-IN') + ' litres' : '';
  const due = formatIndentDate(indentDueDate({ ...doc, data }));
  const rows = [['Indent number', number], ['Indent date', formatIndentDate(doc.day)], ['Site / location', doc.site], ['Requested by', requester],
    ['Item', doc.indentItem?.name ?? doc.result?.item ?? 'Diesel'], ['Quantity', quantity], ['Priority', data.priority ?? ''],
    ['Required date', due], ['Reason', data.reason ?? ''], ['Remarks', data.remarks ?? '']];
  const caption = ['Diesel indent ' + number, 'Site: ' + doc.site, 'Quantity: ' + quantity + (data.priority ? ' · ' + data.priority : ''),
    due && 'Required: ' + due, requester && 'Requested by: ' + requester].filter(Boolean).join('\n').slice(0, 700);
  return { number, rows, caption, litres: Number.isFinite(litres) && litres > 0 ? litres : null };
}

export const litresText = value => Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 }) + ' litres';
// The sanction quantity an approver gave, as litres, or the reason it cannot stand.
export function sanctionQuantity(text, request) {
  const value = Number(String(text ?? '').trim().replace(/,/g, '').replace(/\s*(l|ltr|ltrs|litres?|liters?)\.?$/i, ''));
  if (!Number.isFinite(value) || value <= 0) return { error: 'Enter the sanction quantity as a number of litres.' };
  if (request.litres != null && value > request.litres) return { error: 'The sanction quantity cannot be more than the requested ' + litresText(request.litres) + '.' };
  return { value: Math.round(value * 100) / 100 };
}

export const decisionLine = request => request.status === 'approved' ? '✅ Approved by ' + request.decided_by + ' · ' + when(request.decided_at)
    + (request.sanctioned != null ? '\nSanctioned: ' + litresText(request.sanctioned) : '')
  : '❌ Declined by ' + request.decided_by + ' · ' + when(request.decided_at) + (request.reason ? '\nReason: ' + request.reason : '');

// What the Entry screens show for an indent: null until an approval has been requested.
export function decisionView(request) {
  if (!request) return null;
  if (request.status === 'pending') return { status: 'pending', label: 'Awaiting approval', detail: request.sent ? 'Sent to ' + request.sent + ' approver' + (request.sent === 1 ? '' : 's') + ' on Telegram'
    : 'Waiting for an approver in Diesel' };
  return { status: request.status, label: request.status === 'approved' ? 'Approved' : 'Declined', sanctioned: request.sanctioned ?? undefined,
    detail: 'by ' + request.decided_by + ' · ' + when(request.decided_at) + (request.sanctioned != null ? ' · sanctioned ' + litresText(request.sanctioned) : '')
      + (request.reason ? ' · ' + request.reason : '') };
}

export function createIndentApproval({ store, telegram, now = () => new Date().toISOString(), report = () => {} }) {
  const quietly = promise => promise.catch(error => report(error));
  // Every copy of the message loses its buttons and gains the outcome, so nobody decides twice.
  // Without a bot, approval still works inside Diesel: there are simply no messages to send or close.
  const close = (doc, request, text) => !telegram ? Promise.resolve() : Promise.all(store.messages(doc).map(({ chat_id, message_id }) => quietly(telegram.send('editMessageCaption', {
    chat_id, message_id, caption: (request.caption + '\n\n' + text).slice(0, 1000), reply_markup: { inline_keyboard: [] } }))));

  async function requested(doc) {
    const { number, rows, caption, litres } = indentSummary(doc);
    const earlier = store.open({ doc: doc.id, rev: doc.rev, number, caption, litres }, now());
    if (!telegram) return 0;
    await Promise.all(earlier.map(({ chat_id, message_id }) => quietly(telegram.send('editMessageCaption', {
      chat_id, message_id, caption: (caption + '\n\n✏️ This indent was edited. A new approval request follows.').slice(0, 1000), reply_markup: { inline_keyboard: [] } }))));
    const approvers = store.linkedApprovers();
    if (!approvers.length) return 0;
    const bytes = await indentPdf({ title: 'Diesel indent', number, rows, footer: 'Sent for approval ' + when(now()) + ' · Diesel, Caliber Pulse' });
    const fileName = number.replace(/[^\w-]+/g, '-') + '.pdf';
    await Promise.all(approvers.map(approver => quietly(telegram.sendDocument({ chatId: approver.chat_id, bytes, fileName, caption, keyboard: buttons(doc.id) })
      .then(message => store.sent(doc.id, approver.chat_id, message.message_id)))));
    return store.request(doc.id).sent;
  }

  async function pressed(query) {
    const chatId = query.message?.chat?.id, [, action, doc] = /^indent:(approve|decline):([\w-]{1,64})$/.exec(query.data ?? '') ?? [];
    const answer = text => quietly(telegram.send('answerCallbackQuery', { callback_query_id: query.id, text, show_alert: true }));
    const approver = chatId === undefined ? null : store.approverByChat(chatId);
    if (!action || !approver) return answer('You are not on the Diesel indent approver list.');
    const waiting = store.request(doc);
    if (!waiting) return answer('This indent is no longer waiting for approval.');
    if (action === 'approve' && waiting.status === 'pending') {
      // Approval needs the sanction quantity, so the decision is taken when the approver sends it.
      await quietly(telegram.send('sendMessage', { chat_id: chatId, text: 'Approving ' + waiting.number + (waiting.litres != null ? ' · requested ' + litresText(waiting.litres) : '')
        + '.\nSend the sanction quantity in litres to approve.', reply_markup: { force_reply: true, input_field_placeholder: 'Sanction quantity (litres)' } })
        .then(message => store.promptQuantity(chatId, doc, message.message_id)));
      return quietly(telegram.send('answerCallbackQuery', { callback_query_id: query.id, text: 'Send the sanction quantity to approve.' }));
    }
    const result = store.decide(doc, 'declined', approver, now());
    const { request, decided } = result;
    if (!decided) {
      await quietly(telegram.send('editMessageCaption', { chat_id: chatId, message_id: query.message.message_id,
        caption: (request.caption + '\n\n' + (request.status === 'pending' ? '' : decisionLine(request))).slice(0, 1000), reply_markup: { inline_keyboard: [] } }));
      return answer('Already ' + request.status + ' by ' + request.decided_by + '.');
    }
    await close(doc, request, decisionLine(request));
    await answer(request.status === 'approved' ? 'Approved.' : 'Declined.');
    if (request.status === 'declined') {
      await quietly(telegram.send('sendMessage', { chat_id: chatId, text: 'Declined ' + request.number + '. Reply to this message with a reason, or ignore it.',
        reply_markup: { force_reply: true, input_field_placeholder: 'Reason (optional)' } }).then(message => store.promptReason(chatId, doc, message.message_id)));
    }
  }

  async function messaged(message) {
    const chatId = message.chat?.id;
    if (message.chat?.type !== 'private' || chatId === undefined) return;
    const say = (text, extra = {}) => quietly(telegram.send('sendMessage', { chat_id: chatId, text, ...extra }));
    if (message.contact) {
      // Telegram only vouches for a contact that is the sender's own.
      if (message.contact.user_id !== message.from?.id) return say('Share your own number using the button below.');
      const approver = store.link(message.contact.phone_number, chatId, now());
      return say(approver ? 'Linked, ' + approver.name + '. Diesel indents will come here for your approval.'
        : 'This number is not on the Diesel indent approver list. Ask the administrator to add it, then send /start again.', { reply_markup: { remove_keyboard: true } });
    }
    const replied = message.reply_to_message?.message_id;
    const asked = store.quantityPrompt(chatId), approver = store.approverByChat(chatId);
    if (asked && approver && typeof message.text === 'string' && !message.text.startsWith('/') && (replied === undefined || replied === asked.message_id)) {
      const request = store.request(asked.doc);
      if (!request || request.status !== 'pending') {
        store.clearQuantityPrompt(chatId);
        return say(request ? 'Already ' + request.status + ' by ' + request.decided_by + '.' : 'This indent is no longer waiting for approval.');
      }
      const quantity = sanctionQuantity(message.text, request);
      if (quantity.error) return say(quantity.error + ' Send it again.');
      const result = store.decide(asked.doc, 'approved', approver, now(), { sanctioned: quantity.value });
      if (!result.decided) return say('Already ' + result.request.status + ' by ' + result.request.decided_by + '.');
      await close(asked.doc, result.request, decisionLine(result.request));
      return say('Approved ' + result.request.number + '. Sanctioned ' + litresText(quantity.value) + '.');
    }
    if (replied !== undefined && typeof message.text === 'string' && message.text.trim()) {
      const request = store.answerReason(chatId, replied, message.text.trim().slice(0, 500));
      if (request) { await close(request.doc, request, decisionLine(request)); return say('Reason recorded.'); }
    }
    if (store.approverByChat(chatId)) return say('You are linked as ' + store.approverByChat(chatId).name + '. Diesel indents will come here for your approval.');
    return say('To approve Diesel indents here, share your mobile number. It must match the number on the approver list.',
      { reply_markup: { keyboard: [[{ text: 'Share my mobile number', request_contact: true }]], resize_keyboard: true, one_time_keyboard: true } });
  }

  // A decision taken inside Diesel by a listed approver. Throws the message to show when it cannot stand.
  async function decide(doc, { decision, sanctioned, reason }, approver) {
    const request = store.request(doc);
    if (!request) throw Error('This indent is not waiting for approval.');
    if (request.status !== 'pending') throw Error('Already ' + request.status + ' by ' + request.decided_by + '.');
    let extra = { reason: String(reason ?? '').trim().slice(0, 500) || null };
    if (decision === 'approve') {
      const quantity = sanctionQuantity(sanctioned, request);
      if (quantity.error) throw Error(quantity.error);
      extra = { sanctioned: quantity.value };
    } else if (decision !== 'decline') throw Error('Choose Approve or Decline.');
    const result = store.decide(doc, decision === 'approve' ? 'approved' : 'declined', approver, now(), extra);
    if (!result.decided) throw Error('Already ' + result.request.status + ' by ' + result.request.decided_by + '.');
    await close(doc, result.request, decisionLine(result.request));
    return result.request;
  }

  return {
    requested,
    decide,
    decision: doc => decisionView(store.request(doc)),
    update: update => update?.callback_query ? pressed(update.callback_query) : update?.message ? messaged(update.message) : undefined,
  };
}
