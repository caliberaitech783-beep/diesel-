import { randomInt } from 'node:crypto';
import { entryRole } from './review-masters.mjs';
import { requireValue as check } from './entry-rules.mjs';

// This local inbox substitutes for Telegram and SMS during operator review.
export function createLocalApproval(db,store) {
  db.exec('CREATE TABLE IF NOT EXISTS entry_review_otp(actor TEXT PRIMARY KEY, doc TEXT, rev INTEGER, code TEXT, expires INTEGER, failures INTEGER, locked INTEGER)');
  const current=id=>db.prepare('SELECT * FROM entry_review_otp WHERE actor=?').get(id);
  function eligible(id,actor) {
    const doc=store.read(id,actor.site);
    check(doc.status==='Awaiting approval' && doc.site===actor.site && doc.maker!==actor.id && doc.result.approvals[doc.stage]===entryRole(actor),'This approval is no longer waiting for this reviewer.');
    return doc;
  }
  function issue(id,actor,now=Date.now()) {
    const doc=eligible(id,actor),row=current(actor.id);
    check(!row||row.locked<=now,'Too many attempts. Try again after 15 minutes.');
    if(row && row.doc===id && row.rev===doc.rev && row.expires>now) return row.code;
    const code=String(randomInt(100000,1000000));
    db.prepare('INSERT OR REPLACE INTO entry_review_otp VALUES(?,?,?,?,?,?,0)').run(actor.id,id,doc.rev,code,now+300000,row?.expires>now?row.failures:0);
    return code;
  }
  function confirm(id,actor,code,now=Date.now()) {
    const doc=eligible(id,actor),row=current(actor.id);
    check(row?.doc===id && row.rev===doc.rev && row.expires>now && row.locked<=now,'Request a valid local SMS code.');
    if(row.code!==code) {
      db.prepare('UPDATE entry_review_otp SET failures=failures+1,locked=CASE WHEN failures>=2 THEN ? ELSE locked END WHERE actor=?').run(now+900000,actor.id);
      throw Error('Incorrect local SMS code.');
    }
    const approved=store.write(id,actor,{action:'Approve',rev:doc.rev},'Local Telegram');
    db.prepare('DELETE FROM entry_review_otp WHERE actor=?').run(actor.id);
    return approved;
  }
  return {issue,confirm};
}
