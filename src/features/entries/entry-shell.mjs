import { themeHead, themeToggle } from '../theme/theme-toggle.mjs';
import { byId, entries } from './catalog.mjs';
import { entryRole, roles, roleKey, sites } from './review-masters.mjs';

export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]);
export const option = (value, label, selected) =>
  `<option value="${esc(value)}"${selected ? ' selected' : ''}>${esc(label)}</option>`;
const groups = ['Buy', 'Receive', 'Store and issue', 'Money', 'Control'];

function navigation(active) {
  return `<aside class="rail"><div class="rail-title"><span>Entry</span>
    <button id="nav-toggle" aria-controls="entry-navigation" aria-expanded="false" hidden>Browse entries</button></div>
    <nav id="entry-navigation" aria-label="Diesel entries">
    <a class="nav-home" href="/entries" ${active ? '' : 'aria-current="page"'}><i class="grid-icon" aria-hidden="true"></i>Entry register</a>
    ${groups.map(group => `<details ${(!active && group === 'Buy') || byId[active]?.group === group ? 'open' : ''}>
      <summary><span>${group}</span><small>${entries.filter(e => e.group === group).length}</small></summary>
      ${entries.filter(e => e.group === group).map(e => `<a href="/entries/type/${e.id}" ${active === e.id ? 'aria-current="page"' : ''}><small>${e.id}</small><span>${esc(e.name)}</span></a>`).join('')}
      </details>`).join('')}
    <a class="masters-link" href="/">← Masters</a></nav></aside>`;
}

function switcher(actor, back) {
  const role = actor.profile === 'entry-deputy' ? 'Deputy Site In-charge' : entryRole(actor);
  return `<details class="context"><summary><i class="location-mark" aria-hidden="true"></i>${esc(actor.site)}<span class="role-name">${esc(role)}</span></summary>
    <form class="switch" method="post" action="/workspace/role"><input type="hidden" name="returnTo" value="${esc(back)}">
    <label>Site<select name="site">${sites.map(s => option(s, s, s === actor.site)).join('')}</select></label>
    <label>Review role<select name="role">${roles.map(r => option(roleKey(r), r, r === role)).join('')}${option('entry-deputy', 'Deputy Site In-charge', actor.profile === 'entry-deputy')}</select></label>
    <button class="primary">Switch</button></form></details>`;
}

export function page(title, actor, active, back, body, heading) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · Diesel entries</title>${themeHead}
    <link rel="stylesheet" href="/entries/assets/entries.css"><script defer src="/entries/assets/entry-form.js"></script><script defer src="/entries/assets/entry-language.js"></script></head><body data-actor="${esc(actor.id)}" data-hosted="${Boolean(actor.hosted)}">
    <a href="#workspace" class="skip-link">Skip to workspace</a>
    <header class="masthead"><a class="brand" href="/"><img src="/masters/assets/pulse.png" alt="" width="34" height="34"><span>Caliber <b>Pulse</b></span><em>Diesel</em></a>
    <div class="tools"><span class="environment">${actor.hosted?'Personal review · sample data':'Local review · sample data'}</span><button type="button" id="entry-language">हिन्दी</button>${themeToggle}</div></header>
    <div class="shell">${navigation(active)}<main id="workspace" tabindex="-1">
    <div class="context-bar"><div class="crumb"><a href="/">Diesel</a><i aria-hidden="true">/</i><a href="/entries">Entry</a>${active ? `<i aria-hidden="true">/</i><span>${esc(active)}</span>` : ''}</div>${switcher(actor,back)}</div>
    ${heading ?? `<h1>${esc(title)}</h1>`}${body}<output id="sync-status" aria-live="polite"></output></main></div></body></html>`;
}
