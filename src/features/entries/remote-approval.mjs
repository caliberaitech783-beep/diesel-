import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { mayApproveEntry } from './approval-roles.mjs';
import { businessDay } from './entry-rules.mjs';

const minute = 60_000;
const ticketLifetime = 15 * minute;
const otpLifetime = 5 * minute;
const ticketPattern = /^[a-f0-9]{32}$/;
const actions = { approve: 'Approve', return: 'Return' };

export function telegramApprovalPath(path) {
  return typeof path === 'string' && /^\/entries\/telegram\/[a-f0-9]{32}\/(approve|return)$/.test(path);
}

export function createRemoteApproval(db, store, { delivery, secret, policyFor, now = Date.now }) {
  db.exec(`CREATE TABLE IF NOT EXISTS entry_approval_challenges (
    reviewer TEXT PRIMARY KEY, ticket TEXT NOT NULL, scope TEXT NOT NULL, doc TEXT NOT NULL,
    rev INTEGER NOT NULL, contact TEXT NOT NULL, created INTEGER NOT NULL,
    sent INTEGER, otp TEXT, action TEXT, failures INTEGER NOT NULL DEFAULT 0,
    consumed INTEGER NOT NULL DEFAULT 0
  )`);
  const find = db.prepare('SELECT * FROM entry_approval_challenges WHERE reviewer=?');
  const setOtp = db.prepare('UPDATE entry_approval_challenges SET sent=?, otp=?, action=? WHERE reviewer=? AND ticket=?');
  const fail = db.prepare('UPDATE entry_approval_challenges SET failures=failures+1 WHERE reviewer=? AND ticket=?');
  const consume = db.prepare('UPDATE entry_approval_challenges SET consumed=1, otp=NULL WHERE reviewer=? AND ticket=?');
  const clearOtp = db.prepare('UPDATE entry_approval_challenges SET otp=NULL WHERE reviewer=? AND ticket=? AND otp=?');
  const save = db.prepare(`INSERT INTO entry_approval_challenges (reviewer,ticket,scope,doc,rev,contact,created)
    VALUES (?,?,?,?,?,?,?) ON CONFLICT(reviewer) DO UPDATE SET ticket=excluded.ticket,scope=excluded.scope,
    doc=excluded.doc,rev=excluded.rev,contact=excluded.contact,created=excluded.created,
    sent=NULL,otp=NULL,action=NULL,failures=0,consumed=0`);
  const hash = (kind, ...parts) => createHmac('sha256', secret).update(JSON.stringify([kind, ...parts])).digest('hex');
  const contactHash = actor => hash('approval contact', actor.approvalContact.chatId, actor.approvalContact.mobile);

  function transaction(work) {
    db.exec('BEGIN IMMEDIATE');
    try { const result = work(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }

  function enabled(doc, actor) {
    if (!actor.approvalContact || !mayApproveEntry(doc, actor) || doc.result.telegramAllowed !== true) return false;
    const rule = policyFor(doc.site, businessDay()).approvals(doc, { ...doc.result, telegramAllowed: false });
    const expected = doc.result.approvals;
    return rule.telegramAllowed === true && rule.approvals.length === expected.length
      && expected.every((role, index) => role === rule.approvals[index]);
  }

  function getDoc(id, actor) {
    let doc;
    try { doc = store.read(id, actor.site); } catch { /* Keep inaccessible records private. */ }
    if (!doc || !enabled(doc, actor)) throw Error('Telegram approval is unavailable for this account, site, or step.');
    return doc;
  }

  function review(ticket, verb, actor) {
    if (!ticketPattern.test(ticket) || !Object.hasOwn(actions, verb) || !actor.approvalContact) {
      throw Error('This Telegram approval link is unavailable.');
    }
    const challenge = find.get(actor.id);
    if (!challenge || challenge.ticket !== ticket || challenge.scope !== actor.actionContext
      || challenge.contact !== contactHash(actor) || challenge.consumed || now() - challenge.created >= ticketLifetime) {
      throw Error('Use the Pulse account, site and role that requested this link. If it expired, request a new link from the entry.');
    }
    const doc = getDoc(challenge.doc, actor);
    if (doc.rev !== challenge.rev) throw Error('This entry changed. Open the entry before reviewing it again.');
    return { challenge, doc, action: actions[verb] };
  }

  return {
    enabled, review,
    async invite(id, actor, rev) {
      const { doc, ticket } = transaction(() => {
        const doc = getDoc(id, actor);
        if (rev !== doc.rev) throw Error('This entry changed. Reopen it before continuing.');
        const existing = find.get(actor.id);
        const time = now();
        if (existing && (time - existing.created < minute || (existing.sent !== null && time - existing.sent < minute)
          || (existing.failures >= 3 && time - existing.created < ticketLifetime))) {
          throw Error('An approval link was sent recently or locked. Follow the latest link or try again later.');
        }
        const ticket = randomBytes(16).toString('hex');
        save.run(actor.id, ticket, actor.actionContext, doc.id, doc.rev, contactHash(actor), time);
        return { doc, ticket };
      });
      await delivery.telegram(actor.approvalContact, doc, ticket);
    },
    async requestCode(ticket, verb, actor) {
      const code = randomInt(1_000_000).toString().padStart(6, '0');
      const otp = hash('approval otp', ticket, verb, code);
      transaction(() => {
        const { challenge } = review(ticket, verb, actor);
        if (challenge.failures >= 3) throw Error('Too many incorrect codes. Wait for this link to expire before trying again.');
        if (challenge.sent !== null && now() - challenge.sent < minute) throw Error('Wait one minute before requesting another SMS.');
        setOtp.run(now(), otp, verb, actor.id, ticket);
      });
      try { await delivery.sms(actor.approvalContact, code); }
      catch (error) { clearOtp.run(actor.id, ticket, otp); throw error; }
    },
    confirm(ticket, verb, actor, { code, reason, device }) {
      if (typeof code !== 'string' || !/^\d{6}$/.test(code)) throw Error('Enter the six-digit code from SMS.');
      const result = transaction(() => {
        const { challenge, action, doc } = review(ticket, verb, actor);
        if (challenge.failures >= 3) throw Error('Too many incorrect codes. Wait for this link to expire before trying again.');
        if (!challenge.otp || challenge.action !== verb || now() - challenge.sent >= otpLifetime) {
          throw Error('Request an SMS code for this action.');
        }
        const submitted = hash('approval otp', ticket, verb, code);
        if (!timingSafeEqual(Buffer.from(submitted), Buffer.from(challenge.otp))) {
          fail.run(actor.id, ticket);
          return null;
        }
        const updated = store.write(doc.id, actor, { action, rev: challenge.rev, reason, device }, 'Telegram / SMS OTP');
        consume.run(actor.id, ticket);
        return updated;
      });
      if (!result) throw Error('Incorrect SMS code.');
      return result;
    },
  };
}
