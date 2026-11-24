import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createIndentApprovalStore } from './approval-store.mjs';
import { approversDenied, approversPage, approversPath } from './approver-page.mjs';
import { createIndentApproval, decisionView } from './indent-approval.mjs';
import { createTelegram, validBotToken } from './telegram.mjs';

const assets = fileURLToPath(new URL('./assets/', import.meta.url));
export const indentWebhookPath = '/telegram/indent-approval';

// getProfile(request) → the signed-in Pulse profile or null; isAdmin(profile) → may change the approver list.
// Returns what Entry needs: requested(doc) after Save indent, and decision(docId) for its screens.
export function registerIndentApproval(app, { db, env, fetcher, publicOrigin, getProfile, isAdmin, startSignIn, now = () => new Date().toISOString() }) {
  const store = createIndentApprovalStore(db);
  const token = env.DIESEL_INDENT_BOT_TOKEN?.trim();
  const telegram = validBotToken(token) ? createTelegram(token, fetcher) : null;
  const bot = { configured: Boolean(token), username: '', webhook: undefined, calls: 0, since: now() };
  const failures = [];
  // Categories only, for the administrator page and logs: never a token, chat or message.
  const report = error => { failures.push(String(error?.message ?? error).slice(0, 120)); if (failures.length > 20) failures.shift(); };
  const approval = telegram && createIndentApproval({ store, telegram, now, report });

  // Tells Telegram where to deliver button presses and replies, then learns the bot's name. Telegram limits
  // these calls hard on shared hosting addresses, so a refusal is retried after the wait Telegram asks for,
  // in the background, and never more often than that.
  let connecting, retry;
  const retryAfter = message => Math.min(3600, Math.max(30, Number(/retry after (\d+)/.exec(message)?.[1] ?? 0) + 5));
  async function attempt(method, body, done) {
    bot.calls = (bot.calls ?? 0) + 1;
    try { done(await telegram.send(method, body)); return true; }
    catch (error) {
      bot.problem = /refused \w+ \((401|404)\)/.test(error.message) ? 'refused' : /reached/.test(error.message) ? 'unreachable' : 'failed';
      bot.detail = String(error.message).slice(0, 160);
      report(error);
      if (bot.problem !== 'refused') {
        clearTimeout(retry);
        retry = setTimeout(connect, retryAfter(error.message) * 1000);
        retry.unref();
      }
      return false;
    }
  }
  const connect = () => connecting ??= (async () => {
    try {
      // Telegram delivers only to a public HTTPS address; without one the bot can still send.
      if (bot.webhook !== true && publicOrigin.startsWith('https:')) {
        const set = await attempt('setWebhook', { url: publicOrigin + indentWebhookPath, secret_token: telegram.webhookSecret, allowed_updates: ['message', 'callback_query'] },
          () => { bot.webhook = true; });
        if (!set) return;
      }
      if (!bot.username && await attempt('getMe', {}, me => { bot.username = me.username ?? ''; })) bot.problem = '';
    } finally { connecting = undefined; }
  })();
  // What is wrong with the saved value, without showing it: only its length and whether it has the two parts of a token.
  if (token && !telegram) Object.assign(bot, { problem: 'format', length: token.length, quoted: /^["'].*["']$/.test(token), parts: token.split(':').length });

  if (telegram) {
    connect();
    app.post(indentWebhookPath, express.json({ limit: '256kb' }), async (request, response) => {
      const given = Buffer.from(String(request.get('x-telegram-bot-api-secret-token') ?? '')), expected = Buffer.from(telegram.webhookSecret);
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) return response.sendStatus(403);
      // Always acknowledged, so one bad update is not redelivered for hours.
      try { await approval.update(request.body); } catch (error) { report(error); }
      response.sendStatus(200);
    });
  }

  app.use(approversPath + '/assets', express.static(assets, { index: false }));
  const admin = handler => async (request, response, next) => {
    try {
      const profile = await getProfile(request);
      if (!profile) return request.method === 'GET' ? startSignIn(response, approversPath) : response.sendStatus(401);
      const name = profile.name || profile.login;
      if (!isAdmin(profile)) return response.status(403).type('html').send(approversDenied(name));
      if (request.method !== 'GET' && (request.get('origin') !== publicOrigin || request.get('sec-fetch-site') === 'cross-site')) return response.sendStatus(403);
      response.set('Cache-Control', 'no-store');
      await handler(request, response, { name, login: profile.login.trim().toLowerCase() });
    } catch (error) { next(error); }
  };
  const show = (response, person, error) => response.status(error ? 422 : 200).type('html')
    .send(approversPage({ name: person.name, approvers: store.approvers(), bot, error }));
  const form = express.urlencoded({ extended: false, limit: '2kb' });
  app.get(approversPath, admin(async (_request, response, person) => {
    // The page shows the current state at once; a retry already waiting is left to its own time.
    if (telegram && !bot.username && !retry) await connect();
    show(response, person);
  }));
  app.post(approversPath, form, admin((request, response, person) => {
    const { name, phone, pulseLogin } = request.body ?? {};
    try {
      store.addApprover({ name: String(name ?? '').trim(), phone: String(phone ?? ''), pulseLogin: String(pulseLogin ?? '').trim() }, person.login, now());
    } catch (error) { return show(response, person, error.message); }
    response.redirect(303, approversPath);
  }));
  app.post(approversPath + '/remove', form, admin((request, response) => {
    const id = Number(request.body?.id);
    if (Number.isSafeInteger(id)) store.removeApprover(id);
    response.redirect(303, approversPath);
  }));

  return {
    // Sends the saved indent for approval. Resolves to how many people received it; never rejects into the save.
    requested: doc => approval ? approval.requested(doc).catch(error => { report(error); return 0; }) : Promise.resolve(null),
    decision: doc => decisionView(store.request(doc)),
    status: () => ({ bot: { ...bot }, failures: [...failures] }),
  };
}
