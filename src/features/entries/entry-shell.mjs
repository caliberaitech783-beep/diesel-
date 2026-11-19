import { themeHead, themeToggle } from '../theme/theme-toggle.mjs';
import { byId, entries } from './catalog.mjs';
import { entryRole, roles, roleKey, sites } from './review-masters.mjs';
import { pilotEntry } from './entry-access.mjs';
import { mayViewEntryType } from './entry-visibility.mjs';

export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]);
export const option = (value, label, selected) =>
  `<option value="${esc(value)}"${selected ? ' selected' : ''}>${esc(label)}</option>`;
const groups = ['Buy', 'Receive', 'Store and issue', 'Money', 'Control'];

function navigation(active, actor) {
  const { assignments:assigned, canOpenMasters, siteEntryTypes:types, hosted } = actor;
  const available = types ? entries.filter(entry=>types.includes(entry.id)) : assigned ? entries.filter(entry => pilotEntry(entry.id)) : entries;
  const visible = types && assigned ? available.filter(entry=>entry.id===active || mayViewEntryType(entry.id,actor)) : available;
  return `<aside class="rail"><div class="rail-title"><span>Entry</span>
    <button id="nav-toggle" aria-controls="entry-navigation" aria-expanded="false" hidden>Browse entries</button></div>
    <nav id="entry-navigation" aria-label="Diesel entries">
    <a class="nav-home" href="/entries" ${active ? '' : 'aria-current="page"'}><i class="grid-icon" aria-hidden="true"></i>Entry register</a>
    <a class="nav-home" href="/entries/home" ${active === 'home' ? 'aria-current="page"' : ''}>My work</a>
    <a class="nav-home" href="/entries/approvals" ${active === 'approvals' ? 'aria-current="page"' : ''}>My approvals</a>
    <a class="nav-home" href="/entries/alerts" ${active === 'alerts' ? 'aria-current="page"' : ''}>My alerts</a>
    ${types || hosted ? `<a class="nav-home" href="/entries/opening-stock" ${active==='opening-stock'?'aria-current="page"':''}>Opening stock</a>` : ''}
    ${groups.filter(group => visible.some(entry => entry.group === group)).map(group => `<details ${(!active && group === 'Buy') || byId[active]?.group === group ? 'open' : ''}>
      <summary><span>${group}</span><small>${visible.filter(e => e.group === group).length}</small></summary>
      ${visible.filter(e => e.group === group).map(e => `<a href="/entries/type/${e.id}" ${active === e.id ? 'aria-current="page"' : ''}><small>${e.id}</small><span>${esc(e.name)}</span></a>`).join('')}
      </details>`).join('')}
    ${canOpenMasters === false ? '' : '<a class="masters-link" href="/">← Masters</a>'}</nav></aside>`;
}

function switcher(actor, back) {
  const role = actor.profile === 'entry-deputy' ? 'Deputy Site In-charge' : entryRole(actor);
  const context = `<i class="location-mark" aria-hidden="true"></i>${esc(actor.site)}<span class="role-name">${esc(role)}</span>`;
  if (actor.assignments?.length === 1) return `<div class="assigned-context">${context}</div>`;
  if (actor.assignments) return `<details class="context"><summary>${context}</summary>
    <form class="switch" method="post" action="/workspace/role"><input type="hidden" name="returnTo" value="${esc(back)}">
    <label>Assigned site and role<select name="assignment">${actor.assignments.map(grant =>
    option(grant.key, grant.site + ' · ' + grant.role, grant.site === actor.site && grant.profile === actor.profile)).join('')}</select></label>
    <button class="primary">Switch</button></form></details>`;
  return `<details class="context"><summary><i class="location-mark" aria-hidden="true"></i>${esc(actor.site)}<span class="role-name">${esc(role)}</span></summary>
    <form class="switch" method="post" action="/workspace/role"><input type="hidden" name="returnTo" value="${esc(back)}">
    <label>Site<select name="site">${sites.map(s => option(s, s, s === actor.site)).join('')}</select></label>
    <label>Review role<select name="role">${roles.map(r => option(roleKey(r), r, r === role)).join('')}${option('entry-deputy', 'Deputy Site In-charge', actor.profile === 'entry-deputy')}</select></label>
    <button class="primary">Switch</button></form></details>`;
}

export function page(title, actor, active, back, body, heading, remoteApproval = false) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · Diesel entries</title>${themeHead}
    <link rel="stylesheet" href="/entries/assets/entries.css"><script defer src="/entries/assets/entry-form.js"></script><script defer src="/entries/assets/entry-language.js"></script>
    ${remoteApproval ? '<script defer src="/entries/assets/remote-approval.js"></script>' : ''}
    ${active==='E11' && actor.siteEntryTypes ? '<script type="module" src="/entries/assets/fuel-issue-form.js"></script>' : ''}
    ${active==='E10A' && actor.siteEntryTypes ? '<script type="module" src="/entries/assets/home-tank.js"></script>' : ''}
    ${['E5','E6','E10A','E10B','E11','E12','E14'].includes(active) ? '<script defer src="/entries/assets/qr-decoder.js"></script><script defer src="/entries/assets/phone-capture.js"></script>' : ''}
    </head><body data-actor="${esc(actor.actionContext ?? actor.id)}" data-hosted="${Boolean(actor.hosted)}" data-offline-scope="${esc(actor.offlineScope)}">
    <a href="#workspace" class="skip-link">Skip to workspace</a>
    <header class="masthead"><a class="brand" href="/"><img src="/masters/assets/pulse.png" alt="" width="34" height="34"><span>Caliber <b>Pulse</b></span><em>Diesel</em></a>
    <div class="tools"><span class="environment">${actor.siteEntryTypes ? (actor.hosted?'Site stock workspace':'Local site stock workspace') : actor.assignments ? 'Role-based pilot · sample data' : actor.trial ? 'Trial workspace · sample data · not live records' : actor.hosted?'Personal review · sample data':'Local review · sample data'}</span><button type="button" id="entry-language">हिन्दी</button>${themeToggle}${actor.assignments ? '<form method="post" action="/api/sign-out"><button>Sign out</button></form>' : ''}</div></header>
    <div class="shell">${navigation(active,actor)}<main id="workspace" tabindex="-1">
    <div class="context-bar"><div class="crumb"><a href="/">Diesel</a><i aria-hidden="true">/</i><a href="/entries">Entry</a>${active ? `<i aria-hidden="true">/</i><span>${esc(active)}</span>` : ''}</div>${switcher(actor,back)}</div>
    ${actor.trial ? `<p class="trial-notice" role="note"><strong>Trial workspace.</strong> ${actor.trial==='role' ? 'Your Pulse account has no Diesel Entry role at an approved site yet' : 'No site from your Pulse roles has a Location Master record yet'}, so this uses sample sites and sample rates for practice. ${actor.trialReason ? '<strong>Reason:</strong> '+esc(actor.trialReason) : ''} Only you can see these entries and none of them is a live record. Live Entry opens for you once Pulse gives you a Diesel Entry role at an approved site.</p>` : ''}
    ${heading ?? `<h1>${esc(title)}</h1>`}${body}<output id="sync-status" aria-live="polite"></output>
    <section id="offline-entries" hidden><h2>Entries waiting to sync</h2><ul></ul></section></main></div></body></html>`;
}
