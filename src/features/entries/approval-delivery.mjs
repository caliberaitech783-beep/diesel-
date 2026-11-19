const fast2sms = 'https://www.fast2sms.com/dev/bulkV2';

export function approvalContact(profile) {
  const contact = profile?.dieselApprovalContact;
  if (typeof contact?.telegramChatId !== 'string' || !/^[1-9]\d{0,15}$/.test(contact.telegramChatId)
    || typeof contact.mobile !== 'string' || !/^\+91[6-9]\d{9}$/.test(contact.mobile)) return null;
  return { chatId: contact.telegramChatId, mobile: contact.mobile };
}

export function createApprovalDelivery(env, publicOrigin, fetcher = fetch) {
  const bot = env.DIESEL_TELEGRAM_BOT_TOKEN?.trim();
  const smsKey = env.DIESEL_FAST2SMS_API_KEY?.trim();
  if (!bot || !/^\d+:[\w-]+$/.test(bot) || !smsKey || !publicOrigin.startsWith('https:')) return null;
  const entryUrl = doc => publicOrigin + '/entries/record/' + doc.id;

  async function send(url, body, accepted, headers = {}) {
    try {
      const response = await fetcher(url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
        headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
      if (response.ok && accepted(await response.json())) return;
    } catch {
      // Provider errors can contain credentials or contact details.
    }
    throw Error('Delivery could not be confirmed. Try again after one minute.');
  }

  return {
    entryUrl,
    telegram({ chatId }, doc, ticket) {
      const button = (text, action) => ({ text, url: publicOrigin + '/entries/telegram/' + ticket + '/' + action });
      return send('https://api.telegram.org/bot' + bot + '/sendMessage', {
        chat_id: chatId, text: 'Diesel approval · ' + doc.number + '\n' + doc.site,
        link_preview_options: { is_disabled: true },
        protect_content: true,
        reply_markup: { inline_keyboard: [[button('Approve', 'approve'), button('Return', 'return')]] },
      }, result => result?.ok === true);
    },
    // A notice carries figures and a link only. Acting on the entry still needs a Pulse sign-in.
    notify({ chatId }, text, url) {
      return send('https://api.telegram.org/bot' + bot + '/sendMessage', {
        chat_id: chatId, text, link_preview_options: { is_disabled: true }, protect_content: true,
        reply_markup: { inline_keyboard: [[{ text: 'Open in Diesel', url }]] },
      }, result => result?.ok === true);
    },
    sms({ mobile }, code) {
      return send(fast2sms, { route: 'otp', numbers: mobile.slice(3), variables_values: code },
        result => result?.return === true, { authorization: smsKey });
    },
  };
}
