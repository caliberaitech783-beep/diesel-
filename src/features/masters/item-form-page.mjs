import { mastersMenuLink } from './master-navigation.mjs';
import { itemFileMenu } from './item-file-menu.mjs';
import { deleteConfirmation } from './record-dialog.mjs';
import { recordDraftScope } from './records-fields.mjs';
import { formSections, displayValue } from './item-form-layout.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);

export function itemFormContent({ master, actor, record, comparison, revisions, home, endpoint, mastersHome, editable,
  editingAllowed, mayReview, creating, historical, submissionsOnly, prefix, dialog, actions, renderField, history }) {
  const sections = formSections(master);
  const scope = record?.site || actor.site || '';
  const groups = sections.map((section, index) => `<section class="field-group" id="section-${index}" aria-labelledby="section-heading-${index}"><h2 class="field-group-heading" id="section-heading-${index}"><span class="section-number" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>${esc(section.name)}<span class="section-completion" data-section-completion></span></h2><div class="field-grid">${section.fields.map(renderField).join('')}</div></section>`).join('');
  const outline = `<aside class="form-outline"><p class="outline-heading">IN THIS FORM</p><nav aria-label="Form sections">${sections.map((section, index) => `<a href="#section-${index}"><span>${String(index + 1).padStart(2, '0')}</span>${esc(section.name)}</a>`).join('')}<a href="#form-review"><span>✓</span>Review details</a></nav><div class="outline-note"><strong>Make it ready for review</strong><p>Complete the required fields and check your details before saving.</p><p><span class="required-mark">*</span> Required field</p></div></aside>`;
  const rows = master.fields.filter(field => displayValue(record?.values[field.key]) !== displayValue(comparison?.values[field.key])).map(field => `<tr><th scope="row">${esc(field.label)}</th><td>${esc(displayValue(comparison?.values[field.key])) || '—'}</td><td>${esc(displayValue(record?.values[field.key])) || '—'}</td></tr>`).join('');
  const lifecycle = actions.filter(action => /data-delete-record|data-action="(?:deactivate|reactivate)"/.test(action));
  const primary = actions.filter(action => !lifecycle.includes(action));
  const reason = mayReview || (editingAllowed && record && !['pending_deactivation','pending_deletion','deleted'].includes(record.status));
  const status = { pending:'Pending review', approved:'Approved', returned:'Returned for changes', inactive:'Inactive', deleted:'Deleted', pending_deactivation:'Deactivation pending', pending_deletion:'Deletion pending' };
  return `<div class="master-editor">
    ${dialog ? '' : mastersMenuLink(mastersHome)}
    ${dialog ? '' : `<p class="editor-breadcrumb"><a href="${home}">Back to Item Master records</a><span aria-hidden="true">/</span>${record ? 'Record details' : 'New record'}</p>`}
    <header class="editor-heading"><div><p class="editor-eyebrow">MASTER CONFIGURATION</p><h1 id="workspace-title">${record ? esc(record.name) : 'New Item Master record'}</h1><p class="editor-description">Set up the details used across Diesel operations.</p></div><span class="approval-badge status-${record?.status ?? 'new'}">${historical ? 'Historical revision' : status[record?.status] ?? 'New record'}</span></header>
    <div class="item-form-header">${itemFileMenu(editable)}</div><output id="item-file-status" aria-live="polite"></output>
    ${record ? `<p class="record-meta">${esc(record.code)} · Revision ${record.revision}${historical ? ` · <a href="${home}&amp;id=${record.id}">Open current record</a>` : ''}</p>` : ''}
    <div class="editor-layout">${outline}<div class="editor-body">
    <form class="master-form" id="record-form" novalidate data-api="${endpoint}" data-actor="${esc(actor.id)}" data-site="${esc(scope)}" data-editable="${editable}"${submissionsOnly ? ' data-private-submission="true"' : ''} data-record-home="${home}" data-slug="item-master" data-master-name="Item Master" data-record="${record?.id ?? ''}" data-revision="${record?.revision ?? ''}"${prefix || submissionsOnly ? ` data-write-scope="${recordDraftScope(actor, master.slug)}"` : ''}${creating && editable ? ` data-import-scope="${recordDraftScope(actor, master.slug)}"` : ''}>
      <div class="draft-notice" id="draft-notice" hidden><p id="draft-message"></p><button type="button" data-restore-draft>Restore draft</button><button type="button" data-discard-draft>Discard draft</button></div>
      <section class="error-summary" id="error-summary" tabindex="-1" aria-labelledby="error-heading" hidden><h2 id="error-heading">Check these fields</h2><ul></ul></section>
      ${groups}
      <section class="field-group review-card" id="form-review"><h2 class="field-group-heading">Review details</h2><div class="review-content"><p>${comparison ? 'Compare with revision ' + comparison.revision + '.' : 'Check the values you have entered before saving for review.'}</p><p data-review-empty${rows ? ' hidden' : ''}>Your entered details will appear here.</p><div class="comparison-table"${rows ? '' : ' hidden'}><table><thead><tr><th>Field</th><th>Previous value</th><th>${editable ? 'Proposed value' : 'Saved value'}</th></tr></thead><tbody data-review-rows>${rows}</tbody></table></div>
      ${reason ? '<div class="master-field change-reason"><label for="change-reason">Reason for change or return <span class="required-mark">*</span></label><textarea id="change-reason" maxlength="1000" required aria-describedby="change-reason-error"></textarea><small class="field-error" id="change-reason-error" hidden></small></div>' : ''}
      ${revisions.find(event => event.reason) ? `<p class="review-reason"><strong>Latest change reason:</strong> ${esc(revisions.find(event => event.reason).reason)}</p>` : ''}
      </div></section>
      ${lifecycle.length ? `<div class="lifecycle-action"><span>Record availability</span>${lifecycle.join(' ')}</div>` : ''}
      <div class="form-footer editor-footer"><div class="save-state"><span class="save-dot" aria-hidden="true"></span><span data-save-state>${editable ? 'Not submitted for review' : 'Viewing saved record'}</span></div>${!dialog ? `<a class="cancel-edit" href="${home}">${editable ? 'Cancel' : 'Back to records'}</a>` : ''}${editable ? '<button type="button" class="secondary-button" data-save-draft>Save local draft</button>' : ''}${primary.join(' ')}<output aria-live="polite"></output></div>
    </form>${history}${record && editingAllowed ? deleteConfirmation(submissionsOnly) : ''}
    </div></div></div>`;
}
