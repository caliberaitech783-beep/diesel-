import { themeHead, themeToggle } from '../theme/theme-toggle.mjs';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
export const approversPath = '/indent-approvers';
const istDay = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' });

function shell(name, body) {
  return `<!doctype html>
<html lang="en"><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Indent approvers · Diesel</title><link rel="icon" href="/masters/assets/pulse.png">
  ${themeHead}
  <link rel="stylesheet" href="/masters/assets/workspace.css">
  <link rel="stylesheet" href="${approversPath}/assets/approvers.css">
</head><body>
  <header class="masthead">
    <div class="brand"><img src="/masters/assets/pulse.png" alt="" width="36" height="36">
      <span class="wordmark">Caliber <strong>Pulse</strong></span><span class="product">Diesel</span></div>
    <div class="account">${themeToggle}<span>${escape(name)}</span><form method="post" action="/api/sign-out"><button>Sign out</button></form></div>
  </header>
  <main class="approvers"><a href="/entries/type/E1">← Diesel indents</a>${body}</main>
</body></html>`;
}

// Says exactly why the bot is not connected, so the fix is clear without anyone seeing the token.
function botProblem(bot) {
  if (!bot.configured) return 'Telegram bot not connected yet. Add the bot token to the Diesel app settings as DIESEL_INDENT_BOT_TOKEN; until then saved indents are not sent.';
  if (bot.problem === 'format') {
    return 'The value saved in DIESEL_INDENT_BOT_TOKEN does not look like a bot token. It is ' + bot.length + ' characters'
      + (bot.quoted ? ' and has quote marks around it; remove the quotes.' : bot.parts !== 2 ? ' and has no colon in the middle; a token is numbers, a colon, then about 35 letters and digits.'
        : '; a token is about 46 characters: numbers, a colon, then 35 letters and digits. Paste it again with nothing before or after it.');
  }
  if (bot.problem === 'refused') return 'Telegram does not recognise the token saved in DIESEL_INDENT_BOT_TOKEN. It was mistyped or has been revoked in BotFather. Copy the current token from BotFather and save it again.';
  const detail = bot.detail ? ' Details: ' + bot.detail : '';
  if (bot.problem === 'unreachable') return 'Diesel could not reach Telegram just now. The token may be fine; refresh this page in a minute.' + detail;
  return 'Diesel could not confirm the bot with Telegram. Refresh this page in a minute.' + detail;
}

export const approversDenied = name => shell(name, `<h1>Indent approvers</h1>
  <p role="alert">Only a Diesel administrator can change who approves indents. Ask an administrator, or ask for your Pulse username to be added to the Diesel administrator list.</p>`);

export function approversPage({ name, approvers, bot, error }) {
  const botLine = bot.username ? `<p class="bot">Telegram bot connected: <strong>@${escape(bot.username)}</strong>${bot.webhook === false ? ' · it cannot receive replies yet, so buttons will not work' : ''}</p>`
    : `<p class="bot off">${escape(botProblem(bot))}</p>`;
  const rows = approvers.map(person => `<tr><td>${escape(person.name)}</td><td>${escape(person.phone)}</td><td>${escape(person.pulse_login)}</td>
    <td>${person.chat_id ? `<span class="linked">Linked</span> · ${escape(istDay.format(new Date(person.linked_at)))}` : '<span class="waiting">Waiting for Start in the bot</span>'}</td>
    <td><form method="post" action="${approversPath}/remove"><input type="hidden" name="id" value="${person.id}"><button aria-label="Remove ${escape(person.name)}">Remove</button></form></td></tr>`).join('');
  return shell(name, `<h1>Indent approvers</h1>
    <p>When someone selects <strong>Save indent</strong>, each linked person below gets the indent as a PDF on Telegram with Approve and Decline buttons. The first decision stands and the others see who decided.</p>
    ${botLine}
    <h2>Add a person</h2>
    ${error ? `<p role="alert">${escape(error)}</p>` : ''}
    <form class="approver-form" method="post" action="${approversPath}">
      <label>Name<input name="name" required maxlength="80" autocomplete="off"></label>
      <label>Mobile number<input name="phone" required inputmode="numeric" maxlength="16" placeholder="10-digit mobile" autocomplete="off"></label>
      <label>Pulse username<input name="pulseLogin" required maxlength="80" autocomplete="off"></label>
      <button>Add</button>
    </form>
    <h2>People who approve (${approvers.length})</h2>
    ${approvers.length ? `<table><thead><tr><th>Name</th><th>Mobile</th><th>Pulse username</th><th>Telegram</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
      : '<p>No one has been added yet.</p>'}
    <h2>How a person links Telegram</h2>
    <ol><li>Add them above with the mobile number their Telegram account uses.</li>
      <li>They open ${bot.username ? `<strong>@${escape(bot.username)}</strong>` : 'the Diesel indent bot'} in Telegram and press <strong>Start</strong>.</li>
      <li>They press <strong>Share my mobile number</strong>. The status above changes to Linked.</li></ol>`);
}
