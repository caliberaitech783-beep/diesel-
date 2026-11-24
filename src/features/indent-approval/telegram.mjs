import { createHmac } from 'node:crypto';

export const validBotToken = token => typeof token === 'string' && /^\d{6,12}:[\w-]{30,}$/.test(token);

// Telegram Bot API for one bot. Errors never carry the token or message contents.
export function createTelegram(token, fetcher = fetch) {
  const url = method => 'https://api.telegram.org/bot' + token + '/' + method;
  async function call(method, options) {
    let reply;
    try {
      const response = await fetcher(url(method), { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(25_000), ...options });
      reply = await response.json();
    } catch (error) {
      // The cause names the kind of network failure only (timeout, DNS, refused connection).
      const cause = error?.name === 'TimeoutError' ? 'timed out' : String(error?.cause?.code ?? error?.name ?? 'network error').replace(/[^\w ]/g, '').slice(0, 40);
      throw Error('Telegram could not be reached (' + method + ': ' + cause + ').');
    }
    // Telegram's own short description says what is wrong ("Unauthorized", "Not Found"); it never contains the token.
    if (reply?.ok !== true) throw Error('Telegram refused ' + method + (reply?.error_code ? ' (' + reply.error_code + ')' : '')
      + (typeof reply?.description === 'string' ? ': ' + reply.description.replace(/[^\w .,:'-]/g, ' ').slice(0, 80) : '') + '.');
    return reply.result;
  }
  return {
    // Telegram echoes this value in a header on every webhook call, proving the call is from Telegram for this bot.
    webhookSecret: createHmac('sha256', token).update('diesel indent approval webhook').digest('hex'),
    send: (method, body) => call(method, { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    sendDocument({ chatId, bytes, fileName, caption, keyboard }) {
      const form = new FormData();
      form.set('chat_id', String(chatId));
      form.set('caption', caption);
      form.set('protect_content', 'true');
      if (keyboard) form.set('reply_markup', JSON.stringify({ inline_keyboard: keyboard }));
      form.set('document', new Blob([bytes], { type: 'application/pdf' }), fileName);
      return call('sendDocument', { body: form });
    },
  };
}
