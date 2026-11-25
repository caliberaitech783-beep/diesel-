import { masterSidebar } from './master-sidebar.mjs';
import { mastersMenuLink } from './master-navigation.mjs';
import { itemFileMenu } from './item-file-menu.mjs';
import { recordDraftScope, masterDefinition } from './records-fields.mjs';
import { themeHead, themeToggle } from '../theme/theme-toggle.mjs';
import { masterSiteMenu } from './master-site-menu.mjs';
import { attributeMasters } from './master-attributes.mjs';
import { attributeFields } from './attribute-page.mjs';
import { recordDialogAssets, recordDialogHost, deleteConfirmation } from './record-dialog.mjs';
import { masterDataSearch } from '../master-data/search.mjs';
import { itemFormContent } from './item-form-page.mjs';
import { legacyTaxSections } from '../tax-masters/rules.mjs';

import accounts from '../company-records/account-master-data.mjs';
import { masterReferences } from './master-references.mjs';

// Active Account Master parties, by name, with the A/C code shown beside each in the search list.
const accountCodes = new Map(accounts.filter(account => account.Status !== 'Inactive' && account['A/C Name'])
  .map(account => [String(account['A/C Name']).trim(), 'A/C ' + account['A/C Code']]));
const accountNames = [...accountCodes.keys()].sort((first, second) => first.localeCompare(second));

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);

function recordField(field, value, index, base, editable, enhanced = false, previous) {
  const id = 'field-' + index;
  const attributes = `id="${id}" name="${escape(field.key)}" ${!editable || field.readOnly ? 'disabled' : ''} ${field.required && !field.readOnly && !(field.type === 'file' && value?.id) ? 'required' : ''}`
    + (field.controlKey ? ` data-field-key="${escape(field.controlKey)}"` : '')
    + (enhanced ? ` aria-describedby="${id}-error${field.hint ? ' ' + id + '-hint' : ''}"` : field.hint ? ` aria-describedby="${id}-hint"` : '');
  let control;
  if (field.options) {
    control = `<select ${attributes}><option value="">Select…</option>${field.options.map(option =>
      `<option value="${escape(option)}"${value === option ? ' selected' : ''}>${escape(field.optionLabels?.get(option) ?? option)}</option>`).join('')}</select>`;
  } else if (field.type === 'file') {
    const saved = value?.id ? `<a href="${base}/attachments/${encodeURIComponent(value.id)}">${enhanced ? 'Download ' : ''}${escape(value.name)}</a>` : '';
    control = `<input ${attributes} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.gif" data-file-id="${escape(value?.id)}">${saved}<small class="field-hint">PDF or image, up to 5 MiB.</small>`;
    if (value?.id && editable && !field.required) control += `<label><input type="checkbox" data-remove-for="${id}"> Remove attachment</label>`;
  } else if (field.type === 'textarea') {
    control = `<textarea ${attributes} rows="3">${escape(value)}</textarea>`;
  } else {
    const list = Array.isArray(field.suggestions) ? `list="${id}-options"` : '';
    control = `<input ${attributes} type="${field.type ?? 'text'}" value="${escape(value)}" ${list} ${field.type === 'number' ? 'step="' + (field.step ?? 'any') + '"' : ''}>`;
    if (list) control += `<datalist id="${id}-options">${field.suggestions.map(option => `<option value="${escape(option)}"${field.suggestionLabels?.has(option) ? ` label="${escape(field.suggestionLabels.get(option))}"` : ''}></option>`).join('')}</datalist>`;
  }
  const hint = field.hint ? `<small class="field-hint" id="${id}-hint">${escape(field.hint)}</small>` : '';
  if (enhanced) {
    const before = previous && typeof previous === 'object' ? previous.name : previous;
    const wide = field.type === 'textarea' || /Specification|Address/.test(field.label);
    return `<div class="master-field${wide ? ' field-wide' : ''}" data-label="${escape(field.label)}" data-compare-value="${escape(before)}"><label for="${id}">${escape(field.label)}${field.required ? ' <span class="required-mark" aria-hidden="true">*</span>' : ''}</label>${control}${hint}<small id="${id}-error" class="field-error" hidden></small></div>`;
  }
  return `<div class="master-field"><label for="${id}">${escape(field.label)}${field.required ? ' <span class="required-mark" aria-hidden="true">*</span>' : ''}</label>${control}${hint}</div>`;
}

export function recordsPage({ prefix = '', master, rows, actor, record, project, locations = [], hasLocation, references, comparison, revisions = [], creating, historical, editingAllowed, approvingAllowed, search, status, offset = 0, limit, masterSelected, submissionsOnly, dialog = false }) {
  if (legacyTaxSections(master.slug, record?.values)) master = masterDefinition(master.slug, record.values);
  const base = prefix + '/api/masters/' + master.slug + '/records';
  const endpoint = base + (record ? '/' + record.id : '');
  const home = prefix + '/records?master=' + master.slug;
  const mastersHome = submissionsOnly || prefix ? '/' : '/records';
  const scope = record?.site ?? actor.site ?? '';
  const history = record && revisions.length ? `<section><h2>Revision history</h2><ol class="revisions">${revisions.map(event =>
    `<li><a href="${home}&amp;id=${record.id}&amp;revision=${event.revision}${dialog ? '&amp;dialog=1' : ''}">Revision ${event.revision}</a> · ${escape(event.action)} · ${escape(event.actorName)} · <time>${escape(event.at)}</time>${event.reason ? ' · ' + escape(event.reason) : ''}</li>`).join('')}</ol></section>` : '';
  const editing = Boolean(record || creating);
  const itemEditing = editing && master.slug === 'item-master';
  const showSidebar = !editing && !masterSelected;
  const editable = editingAllowed && !['inactive', 'pending_deactivation', 'pending_deletion', 'deleted'].includes(record?.status);
  const actorId = typeof actor === 'string' ? actor : actor.id;
  const isLocation = master.slug === 'location-master';
  const isStorage = master.slug === 'storage-location-master';
  const prerequisite = submissionsOnly ? '' : isLocation && !project ? 'Sync the project directory from Pulse 1 to create a location.'
    : isStorage && !locations.length ? 'Approve a Location Master record for this site before adding storage.' : '';
  function renderField(field) {
    let value = record?.values[field.key];
    let allowEdit = editable;
    if (!submissionsOnly && master.slug === 'shift-master' && field.key === 'Site') { value = scope; allowEdit = false; }
    if (!submissionsOnly && isLocation && (field.key === 'Client' || field.key === 'Location Name')) {
      const sourceValue = field.key === 'Client' ? project?.client : project?.name;
      if (!record || editable) value = sourceValue ?? value;
      allowEdit = false;
    }
    if (isLocation && record && field.key === 'Location Code') allowEdit = false;
    const index = master.fields.indexOf(field);
    if (!submissionsOnly && isStorage && field.key === 'Location') {
      const labels = new Map(locations.map(location => [location.code, location.name + ' · ' + location.code]));
      if (value && !labels.has(value)) labels.set(value, value);
      return recordField({ ...field, options: [...labels.keys()], optionLabels: labels }, value, index, endpoint, allowEdit, itemEditing, comparison?.values[field.key]);
    }
    // A field that names an account is typed into a box that searches the Account Master by name or code.
    if (submissionsOnly && masterReferences[master.slug]?.[field.key]?.master === 'account-master') {
      return recordField({ ...field, suggestions: accountNames, suggestionLabels: accountCodes, hint: field.hint ?? 'Type a name or A/C code to search the Account Master.' },
        value, index, endpoint, allowEdit, itemEditing, comparison?.values[field.key]);
    }
    const choices = !submissionsOnly && references?.get(field.key);
    if (choices) {
      const labels = new Map(choices);
      if (value && !labels.has(value)) labels.set(value, value + ' · not an approved record');
      const hint = labels.size ? field.hint : 'Approve the record this field refers to first.';
      return recordField({ ...field, options: [...labels.keys()], optionLabels: labels, hint }, value, index, endpoint, allowEdit, itemEditing, comparison?.values[field.key]);
    }
    return recordField(field, value, index, endpoint, allowEdit, itemEditing, comparison?.values[field.key]);
  }
  const groups = editing ? master.sections.map(section => {
    const fields = master.fields.filter(field => field.section === section.name);
    const layout = section.columns ? ` data-columns="${section.columns}"` : '';
    return `<section class="field-group"><h2 class="field-group-heading">${escape(section.name)}</h2><div class="field-grid"${layout}>${fields.map(renderField).join('')}</div></section>`;
  }).join('') : '';
  const actions = [];
  if (editable) actions.push('<button type="submit" data-save-for-review>Save for review</button>');
  const mayReview = approvingAllowed && ['pending', 'pending_deactivation', 'pending_deletion'].includes(record?.status)
    && actorId.trim().toLowerCase() !== record.editedBy.toLowerCase();
  if (mayReview) actions.push('<button type="button" data-action="approve">Approve revision</button>',
    '<button type="button" data-action="return">Return for changes</button>');
  if (!submissionsOnly && editingAllowed && record && !['pending_deactivation','pending_deletion','deleted'].includes(record.status)) actions.push(record.status === 'inactive' ? '<button type="button" data-action="reactivate">Request reactivation</button>' : '<button type="button" data-action="deactivate">Request deactivation</button>');
  if (editingAllowed && record && !['pending_deletion','deleted'].includes(record.status)) actions.push('<button type="button" class="record-delete" data-delete-record>Delete record</button>');
  if (dialog) actions.push('<button type="button" data-dialog-cancel>Cancel</button>');
  const heading = `<h1 id="workspace-title">${record ? escape(record.name) : 'New ' + escape(master.name) + ' record'}</h1>`;
  let content = editing ? `
    ${dialog ? '' : submissionsOnly || master.slug === 'item-master' ? mastersMenuLink(mastersHome) : `<a class="masters-back" href="${home}">← Back to records</a>`}
    <div class="item-form-header">${heading}${itemFileMenu(editable)}</div>
    ${record?.companyRecord ? '<p class="record-meta">Company ERP record · Changes are saved in Diesel.</p>' : ''}
    ${record?.sourceName ? `<p class="record-meta">${escape(record.sourceName)}</p>` : ''}
    ${prerequisite ? `<p>${escape(prerequisite)}</p>` : ''}
    <output id="item-file-status" aria-live="polite"></output>
    ${record ? `<p class="record-meta">${escape(record.code)} · ${escape(record.status.replace('_',' '))} · Revision ${record.revision}${historical ? ` · <a href="${home}&amp;id=${record.id}">Open current record</a>` : ''}</p>` : ''}
    <form class="master-form" id="record-form" data-api="${endpoint}"${submissionsOnly ? ' data-private-submission="true"' : ''} data-record-home="${home}" data-slug="${master.slug}" data-master-name="${escape(master.name)}" data-record="${record?.id ?? ''}" data-revision="${record?.revision ?? ''}"${prefix || submissionsOnly ? ` data-write-scope="${recordDraftScope(actor, master.slug)}"` : ''}${creating && editable ? ` data-import-scope="${recordDraftScope(actor, master.slug)}"` : ''}>
      ${submissionsOnly ? '' : `<p class="record-meta">Site · ${escape(scope)}</p>`}${groups}
      ${!submissionsOnly && attributeMasters.has(master.slug) ? attributeFields(record,editable,endpoint) : ''}
      ${mayReview || (editingAllowed && record && !['pending_deactivation','pending_deletion','deleted'].includes(record.status)) ? '<div class="master-field change-reason"><label for="change-reason">Reason for change or return</label><textarea id="change-reason" maxlength="1000" required></textarea></div>' : ''}
      ${actions.length ? `<div class="form-footer">${actions.join(' ')}<output aria-live="polite"></output></div>` : ''}
    </form>${history}${record && editingAllowed ? deleteConfirmation(submissionsOnly) : ''}` : `
    <header class="workspace-heading master-data-heading">
      ${mastersMenuLink(prefix + '/master-data', 'Back to Master Data')}
      <h1 id="workspace-title">${escape(master.name)}</h1>
      ${masterDataSearch({ master, action: prefix + '/records', search, status: submissionsOnly ? undefined : status })}
    </header>
    ${masterSiteMenu(actor,prefix,'records',master.slug)}
    ${project ? `<p>Pulse 1 project · ${escape(project.name)} · ${escape(project.client)}</p>` : ''}
    ${prerequisite ? `<p>${escape(prerequisite)}</p>` : ''}
    ${editingAllowed && !prerequisite && !hasLocation ? `<p><a class="record-primary" href="${home}&amp;new=1">New record</a></p>` : ''}
    <div data-live-records data-live-scope="${recordDraftScope(actor, master.slug)}">
    <div class="record-list">${rows.length ? `<table><thead><tr><th>Code</th><th>Name</th>${submissionsOnly ? '' : '<th>Site</th>'}<th>Status</th><th>Revision</th><th>Actions</th></tr></thead><tbody>${rows.map(row =>
      `<tr><td><a data-record-dialog href="${escape(row.recordPath ?? home + '&id=' + row.id)}">${escape(row.code)}</a></td><td>${escape(row.name)}</td>${submissionsOnly ? '' : `<td>${escape(row.site || 'Company-wide')}</td>`}<td>${escape(row.status.replace('_',' '))}</td><td>${row.revision}</td><td><a class="record-edit-link" data-record-dialog href="${escape(row.recordPath ?? home + '&id=' + row.id)}">${editingAllowed && row.canEdit !== false && !['inactive','pending_deactivation','pending_deletion','deleted'].includes(row.status) ? 'Edit' : 'View'}</a></td></tr>`).join('')}</tbody></table>` : '<p>No records match this view.</p>'}</div>
    <div class="pager">${[...(offset > 0 ? [[Math.max(0, offset - limit), 'Previous']] : []), ...(rows.length === limit ? [[offset + limit, 'Next']] : [])]
      .map(([next, title]) => `<a href="${home}&amp;q=${encodeURIComponent(search)}&amp;status=${status}&amp;offset=${next}">${title}</a>`).join(' ')}</div></div>`;
  if (itemEditing) content = itemFormContent({ master, actor, record, comparison, revisions, home, endpoint, mastersHome,
    editable, editingAllowed, mayReview, creating, historical, submissionsOnly, prefix, dialog, actions, renderField, history });
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(master.name)} records · Diesel</title>
    <link rel="icon" href="/masters/assets/pulse.png">
    ${themeHead}${recordDialogAssets}
    <link rel="stylesheet" href="/masters/assets/workspace.css"><link rel="stylesheet" href="/masters/assets/${itemEditing ? 'item-form' : 'master-form'}.css"><link rel="stylesheet" href="/masters/assets/records.css">${itemEditing ? '<link rel="stylesheet" href="/masters/assets/item-records.css">' : ''}
    ${editing ? '' : '<link rel="stylesheet" href="/master-data/assets/master-data.css"><script type="module" src="/master-data/assets/live-records.js"></script>'}
    <script type="module" src="/masters/assets/records.js"></script>
    ${editing ? '<link rel="stylesheet" href="/masters/assets/item-file-menu.css"><script type="module" src="/masters/assets/item-file-menu.js"></script>' : ''}
    ${isStorage && editing ? '<script type="module" src="/masters/assets/storage-location.js"></script>' : ''}
    ${master.slug === 'diesel-rate-master' && editing ? '<script type="module" src="/masters/assets/diesel-rate.js"></script>' : ''}
    ${showSidebar ? '<script type="module" src="/masters/assets/navigation.js"></script>' : ''}</head><body${dialog ? ' class="record-dialog-page"' : ''}>
    <a class="skip" href="#workspace">Skip to workspace</a>
    <header class="masthead"><div class="brand"><img src="/masters/assets/pulse.png" width="36" height="36" alt=""><span class="wordmark">Caliber <strong>Pulse</strong></span><span class="product">Diesel</span></div>
    <div class="account">${themeToggle}${submissionsOnly || prefix ? `<span>${escape(actor.name ?? actorId)}</span><form method="post" action="/api/sign-out"><button>Sign out</button></form>` : `<a href="/workspace">${escape(actor.name ?? actorId)}</a>`}</div></header>
    <div class="layout">${showSidebar ? masterSidebar({ itemRecordsPath: home + (editingAllowed ? '&amp;new=1' : ''), masterData: true,
      masterDataPath: prefix+'/master-data', pulseMasters: Boolean(prefix || submissionsOnly),localIndentDrafts: !prefix && !submissionsOnly && !actor.siteEntryTypes }) : ''}
    <main id="workspace"${editing ? itemEditing ? '' : ' class="master-form-workspace"' : ' class="master-data-workspace"'} tabindex="-1" aria-labelledby="workspace-title">${content}</main></div>${!editing ? recordDialogHost : ''}</body></html>`;
}
