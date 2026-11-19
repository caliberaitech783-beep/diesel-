import { byId } from './catalog.mjs';

const rupees = value => '₹' + new Intl.NumberFormat('en-IN',{maximumFractionDigits:2}).format(value);
const litres = value => new Intl.NumberFormat('en-IN',{maximumFractionDigits:2}).format(value) + ' L';
const present = value => value !== undefined && value !== null && value !== '';

// The figures an approver needs before opening the entry, following the message drafts in the final templates.
export function keyFigures(doc) {
  const { data:d = {}, result:r = {} } = doc;
  const figures = {
    E1: () => [litres(r.litres), present(r.daysOfStock) && r.daysOfStock + ' days of stock', d.requiredBy && 'required by ' + d.requiredBy],
    E2: () => [d.type + ' PO', [d.supplier, r.depot ?? d.depot].filter(present).join(' '), d.basis, d.kl + ' KL × ' + rupees(r.rate) + ' = ' + rupees(r.value)],
    E3: () => [r.supplier, rupees(r.net) + ' net', present(r.tds) && r.tds > 0 && 'TDS ' + rupees(r.tds)],
    E5: () => [d.truck, litres(d.litres), d.intact === 'No' && 'seals not intact'],
    E6: () => ['received ' + litres(r.accepted) + ' of ' + litres(r.invoiceLitres), 'short ' + litres(r.shortage), d.decision],
    E8: () => [d.bill, rupees(r.amount), r.match],
    E9: () => [r.party, 'freight ' + rupees(r.freight), 'debit note ' + rupees(r.debit), 'net ' + rupees(r.net)],
    E10A: () => [d.tank + ' to ' + d.bowser, litres(r.litres), 'difference ' + r.difference + '%'],
    E10C: () => [litres(r.accepted) + ' into ' + r.bowsers + ' bowsers', 'short ' + litres(r.shortage)],
    E11: () => [d.vehicle, litres(r.litres), 'override asked'],
    E12: () => [d.from + ' to ' + r.destination, litres(r.sent)],
    E13: () => [d.party, litres(r.litres), rupees(r.amount)],
    E14: () => [d.vehicle, litres(r.litres), rupees(r.amount)],
    E15: () => [present(r.variancePercent) ? 'variance ' + r.variancePercent + '%' : 'count submitted'],
    E16: () => [r.original, d.field + ': ' + r.recorded + ' → ' + r.corrected],
    E17: () => [d.month, 'closing ' + litres(r.litres), rupees(r.closingValue)],
  }[doc.type]?.() ?? [];
  return figures.filter(Boolean).join(' · ');
}

const title = doc => byId[doc.type].name + ' ' + doc.number + ' · ' + doc.site;

// What changed in one write, and who should hear about it. Roles are resolved to people by the caller.
export function noticesFor(before, doc, actorRole, reason) {
  if (doc.result?.telegramAllowed !== true || !doc.number) return [];
  const steps = doc.result.approvals ?? [], waiting = doc.status === 'Awaiting approval';
  const moved = before?.status === 'Awaiting approval' && (before.stage !== doc.stage || !waiting);
  const notices = [];
  if (waiting && (before?.status !== 'Awaiting approval' || before.stage !== doc.stage)) {
    notices.push({ role: steps[doc.stage], text: [title(doc), keyFigures(doc),
      'Raised by ' + doc.role + '. Your level ' + (doc.stage + 1) + ' of ' + steps.length + '.'].filter(Boolean).join('\n') });
    if (moved) notices.push({ maker: true, text: title(doc) + '\nApproved by ' + actorRole + '. Now with ' + steps[doc.stage] + '.' });
  } else if (doc.status === 'Awaiting Treasury' && before?.status !== 'Awaiting Treasury') {
    notices.push({ role: 'Treasury', text: [title(doc), keyFigures(doc), 'Approved. Pay through the bank and record the UTR.'].join('\n') });
    notices.push({ maker: true, text: title(doc) + '\nApproved by ' + actorRole + '. Now with Treasury.' });
  } else if (doc.status === 'Returned' && before?.status !== 'Returned') {
    notices.push({ maker: true, text: title(doc) + '\nReturned by ' + actorRole + (reason ? ': “' + String(reason).slice(0, 300) + '”' : '.') });
  } else if (moved && ['Posted', 'In transit'].includes(doc.status)) {
    notices.push({ maker: true, text: title(doc) + '\nFully approved by ' + actorRole + '.' });
  }
  return notices;
}

export function createTelegramNotices(db, { notify, entryUrl }) {
  db.exec('CREATE TABLE IF NOT EXISTS entry_notice_contacts(login TEXT PRIMARY KEY, chat TEXT NOT NULL, grants TEXT NOT NULL)');
  const saved = new Map(db.prepare('SELECT login,chat,grants FROM entry_notice_contacts').all().map(row => [row.login, row.chat + row.grants]));
  const upsert = db.prepare('INSERT INTO entry_notice_contacts VALUES(?,?,?) ON CONFLICT(login) DO UPDATE SET chat=excluded.chat,grants=excluded.grants');
  const forget = db.prepare('DELETE FROM entry_notice_contacts WHERE login=?');
  return {
    // Called on each signed-in request, so the directory follows the verified Pulse profile.
    remember(actor) {
      if (!actor?.id || !Array.isArray(actor.assignments)) return;
      if (!actor.approvalContact) { if (saved.delete(actor.id)) forget.run(actor.id); return; }
      const grants = JSON.stringify(actor.assignments.map(grant => [grant.site, grant.role]));
      if (saved.get(actor.id) === actor.approvalContact.chatId + grants) return;
      upsert.run(actor.id, actor.approvalContact.chatId, grants);
      saved.set(actor.id, actor.approvalContact.chatId + grants);
    },
    announce(before, doc, actor, actorRole, reason) {
      const notices = noticesFor(before, doc, actorRole, reason);
      if (!notices.length) return [];
      const people = db.prepare('SELECT login,chat,grants FROM entry_notice_contacts').all();
      const sent = [];
      for (const notice of notices) {
        const targets = notice.maker ? people.filter(person => person.login === doc.maker)
          : people.filter(person => person.login !== doc.maker && JSON.parse(person.grants).some(([site, role]) => site === doc.site && role === notice.role));
        for (const person of targets) {
          if (person.login === actor.id) continue;
          sent.push(person.login);
          Promise.resolve().then(() => notify({ chatId: person.chat }, notice.text, entryUrl(doc))).catch(() => {});
        }
      }
      return sent;
    },
  };
}
