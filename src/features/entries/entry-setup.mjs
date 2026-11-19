import { themeHead, themeToggle } from '../theme/theme-toggle.mjs';

const pending = 'Diesel Entry is awaiting site setup.';

// Why Entry is still closed, in the words a master maker can act on.
export const setupReasons = {
  source: ['Entry cannot read the approved master data.',
    'Ask IT to check the Diesel app’s master data storage and its DIESEL_SITE_MASTER_DB setting, then restart the app.'],
};

function setupPage(reason) {
  const [cause, action] = setupReasons[reason] ?? [];
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Entry setup · Diesel</title>
  ${themeHead}
  <link rel="stylesheet" href="/sign-in.css">
</head>
<body>
  <main>
    <header><span>CALIBER PULSE</span>${themeToggle}</header>
    <section aria-labelledby="page-title">
      <h1 id="page-title">Entry setup</h1>
      <p>${pending}</p>
      ${cause ? `<p><strong>${cause}</strong> ${action}</p>` : ''}
      <p>Entry opens after the site’s approved master data and verified Pulse roles are connected. The Site In-charge then records measured opening stock for the Project Manager to approve.</p>
      <a href="/">Back to Masters</a>
    </section>
  </main>
</body>
</html>`;
}

export function sendEntrySetup(req,res,reason) {
  if (!['GET','HEAD'].includes(req.method) || req.accepts(['html','json']) !== 'html') {
    return res.status(503).json({ error: pending });
  }
  const overview = req.path === '/' || req.path === '/opening-stock';
  return res.status(overview ? 200 : 503).type('html').send(setupPage(reason));
}

export function registerEntrySetup(app, { publicOrigin, startSignIn, getProfile }) {
  app.use('/entries', async (req, res) => {
    const read = req.method === 'GET' || req.method === 'HEAD';
    const page = read && req.accepts(['html', 'json']) === 'html';
    if (!read && req.get('origin') !== publicOrigin) return res.sendStatus(403);
    let profile;
    try { profile = await getProfile(req); }
    catch { return res.status(503).json({ error: 'Pulse sign-in is temporarily unavailable.' }); }
    if (!profile) {
      if (page) return startSignIn(res, req.path === '/opening-stock' ? '/entries/opening-stock' : '/entries');
      return res.sendStatus(401);
    }
    return sendEntrySetup(req,res,'source');
  });
}
