import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import express from 'express';
import { themeHead, themeToggle } from '../theme/theme-toggle.mjs';
import { roles, roleKey, sites } from '../entries/review-masters.mjs';

const profiles = {
  maker: { name: 'Item maker', canEditMasters: true, canApproveMasters: false },
  checker: { name: 'Item checker', canEditMasters: false, canApproveMasters: true },
  ...Object.fromEntries(roles.map(role => [roleKey(role), {name:role,canEditMasters:false,canApproveMasters:false}])),
  'entry-deputy': {name:'Deputy Site In-charge',canEditMasters:false,canApproveMasters:false},
};

export function registerLocalSession(app) {
  const secret = randomBytes(32);
  const signature = value => createHmac('sha256', secret).update(value).digest('base64url');
  app.use((request, response, next) => {
    const address = request.socket.remoteAddress;
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address)
      || !['localhost', '127.0.0.1', '[::1]'].includes(request.hostname)) {
      return response.sendStatus(403);
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const origin = request.get('origin');
      if (request.get('sec-fetch-site') === 'cross-site' || origin !== 'http://' + request.get('host')) {
        return response.status(403).send('Open this action from the local Diesel workspace.');
      }
    }
    response.set({
      'Cache-Control': 'no-store', 'Referrer-Policy': 'same-origin', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; style-src 'self'; script-src 'self'; img-src 'self'; connect-src 'self'; frame-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    });
    const cookie = (request.get('cookie') || '').split(';').map(value => value.trim()).find(value => value.startsWith('diesel_local='));
    let context='';
    try { context=decodeURIComponent(cookie?.slice('diesel_local='.length) || ''); } catch { /* Ignore a damaged cookie. */ }
    const [role, site, mac] = context.split('.');
    const expected = signature(role + '.' + site);
    const valid = Object.hasOwn(profiles, role) && sites.includes(site) && mac?.length === expected.length
      && /^[a-zA-Z0-9_-]+$/.test(mac) && timingSafeEqual(Buffer.from(expected), Buffer.from(mac));
    const key = valid ? role : 'maker';
    const activeSite = valid ? site : sites[0];
    request.dieselActor = { id: activeSite + '-' + key, profile:key, role: profiles[key].name, site: activeSite, ...profiles[key] };
    next();
  });
  app.get(['/login', '/workspace'], (request, response) => {
    const actor = request.dieselActor;
    const options = Object.entries(profiles).map(([key, profile]) =>
      `<option value="${key}"${actor.role === profile.name ? ' selected' : ''}>${profile.name}</option>`).join('');
    const siteOptions = sites.map(site => `<option${site === actor.site ? ' selected' : ''}>${site}</option>`).join('');
    response.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Local review roles · Diesel</title>${themeHead}<link rel="stylesheet" href="/masters/assets/workspace.css"><link rel="stylesheet" href="/masters/assets/master-form.css"></head><body>
      <header class="masthead"><div class="brand"><img src="/masters/assets/pulse.png" alt="" width="36" height="36"><span class="wordmark">Caliber <strong>Pulse</strong></span><span class="product">Diesel</span></div>${themeToggle}</header>
      <main><h1>Local review role</h1><p>Use these sample roles to try entering and approving master records on this computer.</p>
      <form method="post" action="/workspace/role" class="master-form"><div class="field-grid">
      <div class="master-field"><label for="role">Sample role</label><select name="role" id="role">${options}</select></div>
      <div class="master-field"><label for="site">Site</label><select name="site" id="site">${siteOptions}</select></div></div>
      <div class="form-footer"><button>Open masters</button></div></form></main></body></html>`);
  });
  app.post('/workspace/role', express.urlencoded({extended:false,limit:'2kb'}), (request, response) => {
    const { role, site } = request.body || {};
    if (!Object.hasOwn(profiles, role) || !sites.includes(site)) return response.sendStatus(400);
    const value = role + '.' + site;
    response.cookie('diesel_local', value + '.' + signature(value), {httpOnly:true,sameSite:'strict',path:'/'});
    const back = request.body.returnTo;
    const target=typeof back==='string' && /^\/entries(?:\/[a-zA-Z0-9-]+)*$/.test(back) ? back : '/records';
    response.redirect(303,target+(target==='/entries/new/E1'&&request.body.indentSite==='1'?'?site='+encodeURIComponent(site):''));
  });
}
