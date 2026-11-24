// Who approves Diesel indents over Telegram, what each indent is waiting for, and what was decided.
// Kept in the shared database so a decision shows for every person and every Entry workspace.
export const phoneKey = value => String(value ?? '').replace(/\D/g, '').slice(-10);

export function createIndentApprovalStore(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS indent_approvers (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL UNIQUE, pulse_login TEXT NOT NULL,
      chat_id TEXT UNIQUE, linked_at TEXT, added_by TEXT NOT NULL, added_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS indent_approval_requests (
      doc TEXT PRIMARY KEY, rev INTEGER NOT NULL, number TEXT NOT NULL, caption TEXT NOT NULL, status TEXT NOT NULL,
      sent INTEGER NOT NULL DEFAULT 0, decided_by TEXT, decided_login TEXT, decided_chat TEXT, decided_at TEXT, reason TEXT,
      requested_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS indent_approval_messages (
      doc TEXT NOT NULL, chat_id TEXT NOT NULL, message_id INTEGER NOT NULL, PRIMARY KEY (doc, chat_id));
    CREATE TABLE IF NOT EXISTS indent_reason_prompts (chat_id TEXT PRIMARY KEY, doc TEXT NOT NULL, message_id INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS indent_quantity_prompts (chat_id TEXT PRIMARY KEY, doc TEXT NOT NULL, message_id INTEGER NOT NULL);`);
  // The requested litres and the litres the approver sanctioned.
  const columns = new Set(db.prepare('PRAGMA table_info(indent_approval_requests)').all().map(column => column.name));
  for (const column of ['litres', 'sanctioned']) if (!columns.has(column)) db.exec('ALTER TABLE indent_approval_requests ADD COLUMN ' + column + ' REAL');
  const run = (sql, ...values) => db.prepare(sql).run(...values);
  const one = (sql, ...values) => db.prepare(sql).get(...values);
  const many = (sql, ...values) => db.prepare(sql).all(...values);
  function transaction(work) {
    db.exec('BEGIN IMMEDIATE');
    try { const result = work(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  const request = doc => one('SELECT * FROM indent_approval_requests WHERE doc=?', doc);

  return {
    approvers: () => many('SELECT * FROM indent_approvers ORDER BY name COLLATE NOCASE, id'),
    linkedApprovers: () => many('SELECT * FROM indent_approvers WHERE chat_id IS NOT NULL ORDER BY id'),
    approverByChat: chatId => one('SELECT * FROM indent_approvers WHERE chat_id=?', String(chatId)),
    approverByLogin: login => one('SELECT * FROM indent_approvers WHERE lower(pulse_login)=? ORDER BY id', String(login ?? '').trim().toLowerCase()),
    pending: () => many("SELECT * FROM indent_approval_requests WHERE status='pending' ORDER BY requested_at"),
    recent: () => many("SELECT * FROM indent_approval_requests WHERE status<>'pending' ORDER BY decided_at DESC LIMIT 20"),
    addApprover({ name, phone, pulseLogin }, addedBy, now) {
      const key = phoneKey(phone);
      if (!/^[A-Za-z][A-Za-z .'-]{1,79}$/.test(name)) throw Error('Enter the person’s name (letters only, up to 80).');
      if (!/^[6-9]\d{9}$/.test(key)) throw Error('Enter a 10-digit Indian mobile number.');
      if (!/^[\w.@-]{2,80}$/.test(pulseLogin)) throw Error('Enter the person’s Pulse username.');
      if (one('SELECT 1 FROM indent_approvers WHERE phone=?', key)) throw Error('This mobile number is already on the list.');
      run('INSERT INTO indent_approvers (name, phone, pulse_login, added_by, added_at) VALUES (?,?,?,?,?)', name, key, pulseLogin, addedBy, now);
    },
    removeApprover: id => run('DELETE FROM indent_approvers WHERE id=?', id).changes > 0,
    // A phone number links to one Telegram chat. Linking again from another chat moves it.
    link(phone, chatId, now) {
      return transaction(() => {
        const approver = one('SELECT * FROM indent_approvers WHERE phone=?', phoneKey(phone));
        if (!approver) return null;
        run('UPDATE indent_approvers SET chat_id=NULL, linked_at=NULL WHERE chat_id=? AND id<>?', String(chatId), approver.id);
        run('UPDATE indent_approvers SET chat_id=?, linked_at=? WHERE id=?', String(chatId), now, approver.id);
        return approver;
      });
    },
    request,
    requests: docs => new Map(docs.map(doc => [doc, request(doc)]).filter(([, found]) => found)),
    // A saved or re-saved indent starts a fresh request; the earlier messages are returned to be closed.
    open({ doc, rev, number, caption, litres = null }, now) {
      return transaction(() => {
        const earlier = many('SELECT chat_id, message_id FROM indent_approval_messages WHERE doc=?', doc);
        run('DELETE FROM indent_approval_messages WHERE doc=?', doc);
        run('DELETE FROM indent_reason_prompts WHERE doc=?', doc);
        run('DELETE FROM indent_quantity_prompts WHERE doc=?', doc);
        run(`INSERT INTO indent_approval_requests (doc, rev, number, caption, status, requested_at, litres) VALUES (?,?,?,?,'pending',?,?)
          ON CONFLICT(doc) DO UPDATE SET rev=excluded.rev, number=excluded.number, caption=excluded.caption, status='pending', sent=0,
          decided_by=NULL, decided_login=NULL, decided_chat=NULL, decided_at=NULL, reason=NULL, requested_at=excluded.requested_at,
          litres=excluded.litres, sanctioned=NULL`,
          doc, rev, number, caption, now, litres);
        return earlier;
      });
    },
    sent(doc, chatId, messageId) {
      run('INSERT OR REPLACE INTO indent_approval_messages (doc, chat_id, message_id) VALUES (?,?,?)', doc, String(chatId), messageId);
      run('UPDATE indent_approval_requests SET sent=(SELECT COUNT(*) FROM indent_approval_messages WHERE doc=?) WHERE doc=?', doc, doc);
    },
    messages: doc => many('SELECT chat_id, message_id FROM indent_approval_messages WHERE doc=?', doc),
    // The first decision stands. Returns { request, decided: true } for it and decided: false for anyone later.
    decide(doc, status, approver, now, { sanctioned = null, reason = null } = {}) {
      return transaction(() => {
        const found = request(doc);
        if (!found) return null;
        if (found.status !== 'pending') return { request: found, decided: false };
        run('UPDATE indent_approval_requests SET status=?, decided_by=?, decided_login=?, decided_chat=?, decided_at=?, sanctioned=?, reason=? WHERE doc=?',
          status, approver.name, approver.pulse_login, approver.chat_id, now, sanctioned, reason, doc);
        run('DELETE FROM indent_quantity_prompts WHERE doc=?', doc);
        return { request: request(doc), decided: true };
      });
    },
    // Approve on Telegram first asks for the sanction quantity; the approver's next number answers it.
    promptQuantity: (chatId, doc, messageId) =>
      run('INSERT OR REPLACE INTO indent_quantity_prompts (chat_id, doc, message_id) VALUES (?,?,?)', String(chatId), doc, messageId),
    quantityPrompt: chatId => one('SELECT * FROM indent_quantity_prompts WHERE chat_id=?', String(chatId)),
    clearQuantityPrompt: chatId => run('DELETE FROM indent_quantity_prompts WHERE chat_id=?', String(chatId)),
    promptReason: (chatId, doc, messageId) =>
      run('INSERT OR REPLACE INTO indent_reason_prompts (chat_id, doc, message_id) VALUES (?,?,?)', String(chatId), doc, messageId),
    // The decliner's reply to the bot's question becomes the reason, once.
    answerReason(chatId, messageId, reason) {
      return transaction(() => {
        const prompt = one('SELECT * FROM indent_reason_prompts WHERE chat_id=? AND message_id=?', String(chatId), messageId);
        if (!prompt) return null;
        run('DELETE FROM indent_reason_prompts WHERE chat_id=?', String(chatId));
        const found = request(prompt.doc);
        if (!found || found.status !== 'declined' || found.decided_chat !== String(chatId)) return null;
        run('UPDATE indent_approval_requests SET reason=? WHERE doc=?', reason, prompt.doc);
        return request(prompt.doc);
      });
    },
  };
}
