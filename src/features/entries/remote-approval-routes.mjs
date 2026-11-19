import express from 'express';
import { esc, page } from './entry-shell.mjs';
import { telegramApprovalPath } from './remote-approval.mjs';

export function registerRemoteApproval(router, approval) {
  const json = express.json({ limit: '4kb' });
  router.post('/record/:id/telegram', json, async (req, res) => {
    const actor = req.dieselActor;
    if (req.body?.actor !== actor.actionContext) return res.sendStatus(403);
    try {
      await approval.invite(req.params.id, actor, req.body.rev);
      res.json({ message: 'Open the message from the Diesel bot in Telegram.' });
    } catch (error) { res.status(422).json({ error: error.message }); }
  });

  router.get('/telegram/:ticket/:action', (req, res) => {
    const { ticket, action: verb } = req.params;
    const actor = req.dieselActor;
    try {
      const { doc, action } = approval.review(ticket, verb, actor);
      const path = '/entries/record/' + doc.id;
      res.send(page(action + ' ' + doc.number, actor, doc.type, path, `
        <p><a href="${esc(path)}">Review the entry details</a></p>
        <form data-remote-confirm method="post">
          <p>Verify this action using the mobile number registered in Pulse.</p>
          ${verb === 'return' ? '<label>Reason for return<input name="reason" required maxlength="2000"></label>' : ''}
          <div class="actions"><button type="button" data-send-code>Send SMS code</button></div>
          <label>Six-digit code<input name="code" inputmode="numeric" autocomplete="one-time-code" required pattern="[0-9]{6}" maxlength="6"></label>
          <div class="actions"><button class="primary" type="submit">${esc(action)}</button></div>
          <output role="status"></output>
        </form>`, undefined, true));
    } catch (error) {
      const approvalPath = '/entries' + req.path;
      const back = telegramApprovalPath(approvalPath) ? approvalPath : '/entries/approvals';
      res.status(403).send(page('Telegram approval unavailable', actor, null, back,
        '<p>' + esc(error.message) + '</p><a href="/entries/approvals">Open My approvals</a>'));
    }
  });
  const respond = handler => async (req, res) => {
    const actor = req.dieselActor;
    if (req.body?.actor !== actor.actionContext) return res.sendStatus(403);
    try { res.json(await handler(req, actor)); }
    catch (error) { res.status(422).json({ error: error.message }); }
  };
  router.post('/telegram/:ticket/:action/code', json, respond(async (req, actor) => {
    await approval.requestCode(req.params.ticket, req.params.action, actor);
    return { message: 'SMS requested. The code expires after five minutes.' };
  }));
  router.post('/telegram/:ticket/:action', json, respond((req, actor) => {
    const { code, reason } = req.body;
    const doc = approval.confirm(req.params.ticket, req.params.action, actor, { code, reason, device: req.get('user-agent') });
    return { url: '/entries/record/' + doc.id, status: doc.status };
  }));
}
