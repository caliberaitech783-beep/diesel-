import { mastersPage } from '../masters/page.mjs';
import { themeHead, themeToggle } from '../theme/theme-toggle.mjs';

const escaped = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

export function signInPage({ profile, message, guest, master } = {}) {
  if (guest || profile) {
    const account = guest ? 'Guest' : `<span>Signed in as ${escaped(profile.name || profile.login)}.</span>
      <form method="post" action="/api/sign-out"><button>Sign out</button></form>`;
    return mastersPage({ master, account, guest });
  }

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Caliber Diesel</title>
  ${themeHead}
  <link rel="stylesheet" href="/sign-in.css">
</head>
<body>
  <main>
    <header><span>CALIBER PULSE</span>${themeToggle}</header>
    <section aria-labelledby="page-title">
      <h1 id="page-title">Diesel</h1>
      ${message ? `<p role="alert">${escaped(message)}</p>` : ''}
      <a href="https://pulse.cmll.in/?login=diesel">Back to Diesel sign in</a>
    </section>
  </main>
</body>
</html>`;
}
