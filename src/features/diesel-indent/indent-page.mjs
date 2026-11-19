import { themeHead, themeToggle } from '../theme/theme-toggle.mjs';
import { siteToday } from './indent-rules.mjs';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]);

function layout(title, actor, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title} · Diesel</title>${themeHead}<link rel="stylesheet" href="/masters/assets/workspace.css">
    <link rel="stylesheet" href="/masters/assets/master-form.css"><link rel="stylesheet" href="/masters/assets/records.css"></head>
    <body><header class="masthead"><div class="brand"><img src="/masters/assets/pulse.png" width="36" height="36" alt=""><span class="wordmark">Caliber <strong>Pulse</strong></span><span class="product">Diesel</span></div>
    <div class="account">${themeToggle}<a href="/workspace">${escape(actor.name)} · ${escape(actor.site)}</a></div></header>
    <main><a href="/records">← Diesel workspace</a><h1>${title}</h1>${body}</main></body></html>`;
}

export function indentList(actor, drafts) {
  return layout('Diesel indents', actor, `<p>${escape(actor.site)} · Drafts</p>
    ${actor.canEditMasters ? '<p><a class="record-primary" href="/entries/indents/new">New indent</a></p>' : ''}
    ${drafts.length ? `<div class="record-list"><table><thead><tr><th>Required by</th><th>Requested litres</th><th>Remarks</th></tr></thead><tbody>${drafts.map(d =>
      `<tr><td><a href="/entries/indents/${d.id}">${escape(d.requiredBy)}</a></td><td>${escape(d.quantity)}</td><td>${escape(d.remarks)}</td></tr>`).join('')}</tbody></table></div>` : '<p>No draft indents for this site.</p>'}`);
}

export function indentPage(actor, draft, { location, item, safeFill }, message = '') {
  const readOnly = actor.canEditMasters ? '' : 'readonly';
  return layout('Diesel indent', actor, `<a href="/entries/indents">← All indents</a><p>Draft · ${escape(actor.site)}</p>
    <form class="master-form" method="post" action="/entries/indents/${draft.id}">
    <input type="hidden" name="revision" value="${escape(draft.revision)}">
    <section class="field-group"><h2>Request details</h2><div class="field-grid">
    <div class="master-field"><label for="project">Project</label><input id="project" readonly value="${escape(location?.name ?? 'Awaiting approved location')}"></div>
    <div class="master-field"><label for="item">Diesel item</label><input id="item" readonly value="${escape(item ? item.code + ' · ' + item.name : 'Awaiting approved item 19726')}"></div>
    <div class="master-field"><label for="quantity">Requested quantity (L)</label><input id="quantity" name="quantity" type="number" step="any" min="0" required ${readOnly} value="${escape(draft.quantity)}"></div>
    <div class="master-field"><label for="requiredBy">Required by</label><input id="requiredBy" name="requiredBy" type="date" min="${siteToday()}" required ${readOnly} value="${escape(draft.requiredBy)}"></div>
    <div class="master-field"><label for="remarks">Remarks</label><textarea id="remarks" name="remarks" maxlength="2000" ${readOnly}>${escape(draft.remarks)}</textarea></div></div></section>
    <section class="field-group"><h2>Stock at this site</h2><p>Safe fill of approved underground tanks · ${safeFill === null ? 'Awaiting tank data' : escape(safeFill.toLocaleString('en-IN')) + ' L'}</p>
    <p>Stock, in-transit litres and issue history are needed to calculate days of stock and suggested quantity.</p></section>
    <p>Official numbering and approval become available when the entry is connected to Document Numbering and Approval Limit masters.</p>
    ${message ? `<p role="alert">${escape(message)}</p>` : ''}${actor.canEditMasters ? '<div class="form-footer"><button type="submit">Save draft</button></div>' : ''}</form>`);
}
