const escaped = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

export function signInPage({ profile, message, guest } = {}) {
  let access = '<p>Use your Caliber Pulse account to sign in.</p>\n      <a href="/api/sign-in/start">Sign in with Pulse</a>';
  if (guest) {
    access = '<p data-access-mode="guest">You’re using Diesel as a guest.</p>';
  } else if (profile) {
    access = `<p>Signed in as ${escaped(profile.name || profile.login)}.</p>
      <form method="post" action="/api/sign-out"><button>Sign out</button></form>`;
  }

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Caliber Diesel</title>
  <link rel="stylesheet" href="/sign-in.css">
</head>
<body>
  <main>
    <header>CALIBER PULSE</header>
    <section aria-labelledby="page-title">
      <h1 id="page-title">Diesel</h1>
      ${message ? `<p role="alert">${escaped(message)}</p>` : ''}
      ${access}
    </section>
  </main>
</body>
</html>`;
}
