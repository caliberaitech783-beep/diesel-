import { masterSidebar } from './master-sidebar.mjs';
import { mastersMenuLink } from './master-navigation.mjs';
import { itemFileMenu } from './item-file-menu.mjs';
import { themeHead, themeToggle } from '../theme/theme-toggle.mjs';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);

function recordField(field, value, index, base, editable) {
  const id = 'field-' + index;
  const attributes = `id="${id}" name="${escape(field.key)}" ${!editable || field.readOnly ? 'disabled' : ''} ${field.required && !field.readOnly && !(field.type === 'file' && value?.id) ? 'required' : ''}`
    + (field.controlKey ? ` data-field-key="${escape(field.controlKey)}"` : '');
  let control;
  if (field.options) {
    control = `<select ${attributes}><option value="">Select…</option>${field.options.map(option =>
      `<option value="${escape(option)}"${value === option ? ' selected' : ''}>${escape(field.optionLabels?.get(option) ?? option)}</option>`).join('')}</select>`;
  } else if (field.type === 'file') {
    const saved = value?.id ? `<a href="${base}/attachments/${encodeURIComponent(value.id)}">${escape(value.name)}</a>` : '';
    control = `<input ${attributes} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.gif" data-file-id="${escape(value?.id)}">${saved}<small class="field-hint">PDF or image, up to 5 MiB.</small>`;
    if (value?.id && editable && !field.required) control += `<label><input type="checkbox" data-remove-for="${id}"> Remove attachment</label>`;
  } else if (field.type === 'textarea') {
    control = `<textarea ${attributes} rows="3">${escape(value)}</textarea>`;
  } else {
    const list = Array.isArray(field.suggestions) ? `list="${id}-options"` : '';
    control = `<input ${attributes} type="${field.type ?? 'text'}" value="${escape(value)}" ${list} ${field.type === 'number' ? 'step="' + (field.step ?? 'any') + '"' : ''}>`;
    if (list) control += `<datalist id="${id}-options">${field.suggestions.map(option => `<option value="${escape(option)}"></option>`).join('')}</datalist>`;
  }
  return `<div class="master-field"><label for="${id}">${escape(field.label)}${field.required ? ' <span class="required-mark" aria-hidden="true">*</span>' : ''}</label>${control}</div>`;
}

export function recordsPage({ master, rows, actor, record, project, locations = [], hasLocation, revisions = [], creating, historical, editingAllowed, approvingAllowed, search, status, offset = 0, limit, masterSelected, submissionsOnly }) {
  const base = '/api/masters/' + master.slug + '/records';
  const endpoint = base + (record ? '/' + record.id : '');
  const home = '/records?master=' + master.slug;
  const mastersHome = submissionsOnly ? '/' : '/records';
  const scope = record?.site ?? actor.site ?? '';
  const history = record && !submissionsOnly ? `<section><h2>Revision history</h2><ol class="revisions">${revisions.map(event =>
    `<li><a href="${home}&amp;id=${record.id}&amp;revision=${event.revision}">Revision ${event.revision}</a> · ${escape(event.action)} · ${escape(event.actorName)} · <time>${escape(event.at)}</time>${event.reason ? ' · ' + escape(event.reason) : ''}</li>`).join('')}</ol></section>` : '';
  const editing = Boolean(record || creating);
  const itemForm = editing && master.slug === 'item-master';
  const showSidebar = !editing && !masterSelected;
  const editable = editingAllowed && !['inactive', 'pending_deactivation'].includes(record?.status);
  const actorId = typeof actor === 'string' ? actor : actor.id;
  const isLocation = master.slug === 'location-master';
  const isStorage = master.slug === 'storage-location-master';
  const prerequisite = isLocation && !project ? 'Sync the project directory from Pulse 1 to create a location.'
    : isStorage && !locations.length ? 'Approve a Location Master record for this site before adding storage.' : '';
  function renderField(field) {
    let value = record?.values[field.key];
    let allowEdit = editable;
    if (isLocation && (field.key === 'Client' || field.key === 'Location Name')) {
      const sourceValue = field.key === 'Client' ? project?.client : project?.name;
      if (!record || editable) value = sourceValue ?? value;
      allowEdit = false;
    }
    if (isLocation && record && field.key === 'Location Code') allowEdit = false;
    const index = master.fields.indexOf(field);
    if (isStorage && field.key === 'Location') {
      const labels = new Map(locations.map(location => [location.code, location.name + ' · ' + location.code]));
      if (value && !labels.has(value)) labels.set(value, value);
      return recordField({ ...field, options: [...labels.keys()], optionLabels: labels }, value, index, endpoint, allowEdit);
    }
    return recordField(field, value, index, endpoint, allowEdit);
  }
  const groups = editing ? master.sections.map(section => {
    const fields = master.fields.filter(field => field.section === section.name);
    return `<section class="field-group"><h2 class="field-group-heading">${escape(section.name)}</h2><div class="field-grid">${fields.map(renderField).join('')}</div></section>`;
  }).join('') : '';
  const actions = [];
  if (editable) actions.push('<button type="submit" data-save-for-review>Save for review</button>');
  if (approvingAllowed && ['pending', 'pending_deactivation'].includes(record?.status) && actorId.trim().toLowerCase() !== record.editedBy.toLowerCase()) actions.push('<button type="button" data-action="approve">Approve revision</button>');
  if (editingAllowed && record && record.status !== 'pending_deactivation') actions.push(record.status === 'inactive' ? '<button type="button" data-action="reactivate">Request reactivation</button>' : '<button type="button" data-action="deactivate">Request deactivation</button>');
  const heading = `<h1 id="workspace-title">${record ? escape(record.name) : 'New ' + escape(master.name) + ' record'}</h1>`;
  const content = editing ? `
    ${master.slug === 'item-master' ? mastersMenuLink(mastersHome) : `<a class="masters-back" href="${home}">← Back to records</a>`}
    ${itemForm ? `<div class="item-form-header">${heading}${itemFileMenu(editable)}</div>
    <output id="item-file-status" aria-live="polite"></output>` : heading}
    ${record ? `<p class="record-meta">${escape(record.code)} · ${escape(record.status.replace('_',' '))} · Revision ${record.revision}${historical ? ` · <a href="${home}&amp;id=${record.id}">Open current record</a>` : ''}</p>` : ''}
    <form class="master-form" id="record-form" data-api="${endpoint}" data-slug="${master.slug}" data-record="${record?.id ?? ''}" data-revision="${record?.revision ?? ''}">
      ${submissionsOnly ? '' : `<p class="record-meta">Site · ${escape(scope)}</p>`}${groups}
      ${editingAllowed && record && record.status !== 'pending_deactivation' ? '<div class="master-field change-reason"><label for="change-reason">Reason for change</label><textarea id="change-reason" maxlength="1000" required></textarea></div>' : ''}
      ${!itemForm || actions.length ? `<div class="form-footer">${actions.join(' ')}<output aria-live="polite"></output></div>` : ''}
    </form>${history}` : `
    ${showSidebar ? '' : mastersMenuLink(mastersHome)}
    <h1 id="workspace-title">${escape(master.name)}</h1>
    ${project ? `<p>Pulse 1 project · ${escape(project.name)} · ${escape(project.client)}</p>` : ''}
    ${prerequisite ? `<p>${escape(prerequisite)}</p>` : ''}
    <form class="record-tools" action="/records" method="get"><input type="hidden" name="master" value="${master.slug}">
      <label>Find by code or name <input type="search" name="q" value="${escape(search)}"></label>
      ${submissionsOnly ? '' : `<label>Status <select name="status">${['', 'pending', 'approved', 'pending_deactivation', 'inactive'].map(item =>
        `<option value="${item}"${status === item ? ' selected' : ''}>${item.replace('_',' ') || 'All'}</option>`).join('')}</select></label>`}<button>Search</button>
    </form>${editingAllowed && !prerequisite && !hasLocation ? `<p><a class="record-primary" href="${home}&amp;new=1">New record</a></p>` : ''}
    <div class="record-list">${rows.length ? `<table><thead><tr><th>Code</th><th>Name</th>${submissionsOnly ? '' : '<th>Site</th>'}<th>Status</th><th>Revision</th></tr></thead><tbody>${rows.map(row =>
      `<tr><td><a href="${home}&amp;id=${row.id}">${escape(row.code)}</a></td><td>${escape(row.name)}</td>${submissionsOnly ? '' : `<td>${escape(row.site || 'Company-wide')}</td>`}<td>${escape(row.status.replace('_',' '))}</td><td>${row.revision}</td></tr>`).join('')}</tbody></table>` : '<p>No records match this view.</p>'}</div>
    <div class="pager">${[...(offset > 0 ? [[Math.max(0, offset - limit), 'Previous']] : []), ...(rows.length === limit ? [[offset + limit, 'Next']] : [])]
      .map(([next, title]) => `<a href="${home}&amp;q=${encodeURIComponent(search)}&amp;status=${status}&amp;offset=${next}">${title}</a>`).join(' ')}</div>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(master.name)} records · Diesel</title>
    <link rel="icon" href="/masters/assets/pulse.png">
    ${themeHead}
    <link rel="stylesheet" href="/masters/assets/workspace.css"><link rel="stylesheet" href="/masters/assets/master-form.css"><link rel="stylesheet" href="/masters/assets/records.css">
    <script type="module" src="/masters/assets/records.js"></script>
    ${itemForm ? '<link rel="stylesheet" href="/masters/assets/item-file-menu.css"><script type="module" src="/masters/assets/item-file-menu.js"></script>' : ''}
    ${isStorage && editing ? '<script type="module" src="/masters/assets/storage-location.js"></script>' : ''}
    ${showSidebar ? '<script type="module" src="/masters/assets/navigation.js"></script>' : ''}</head><body>
    <a class="skip" href="#workspace">Skip to workspace</a>
    <header class="masthead"><div class="brand"><img src="/masters/assets/pulse.png" width="36" height="36" alt=""><span class="wordmark">Caliber <strong>Pulse</strong></span><span class="product">Diesel</span></div>
    <div class="account">${themeToggle}${submissionsOnly ? `<span>${escape(actor.name ?? actorId)}</span><form method="post" action="/api/sign-out"><button>Sign out</button></form>` : `<a href="/workspace">${escape(actor.name ?? actorId)}</a>`}</div></header>
    <div class="layout">${showSidebar ? masterSidebar({ itemRecordsPath: home + (editingAllowed ? '&amp;new=1' : '') }) : ''}
    <main id="workspace" tabindex="-1" aria-labelledby="workspace-title">${content}</main></div></body></html>`;
}
