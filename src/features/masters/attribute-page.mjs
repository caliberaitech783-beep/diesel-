import { attributeColumn, attributeExpiry, attributeExport, attributeNames, maxAttributes } from './master-attributes.mjs';

const esc=text=>String(text??'').replace(/[&<>"']/g, char=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
})[char]);

function row(item, editable, base, approved) {
  const state=approved ? attributeExpiry(item.validTo) : '';
  const disabled=editable?'':' disabled';
  return `<fieldset data-attribute-row data-id="${esc(item.id)}" class="field-group">
    <legend>${esc(item.name || 'Attribute')}</legend><div class="field-grid">
    <label>Attribute name<select data-attribute-name required${disabled}><option value="">Select…</option>
    ${attributeNames.map(name=>`<option${name===item.name?' selected':''}>${esc(name)}</option>`).join('')}</select></label>
    <label>Value<input data-attribute-value value="${esc(item.value)}" required maxlength="256"${disabled}></label>
    <label>Jurisdiction or reference<input data-attribute-reference value="${esc(item.reference)}" maxlength="100"${disabled}></label>
    <label>Valid from<input data-attribute-from type="date" value="${esc(item.validFrom)}"${disabled}></label>
    <label>Valid to<input data-attribute-to type="date" value="${esc(item.validTo)}"${disabled}></label>
    <div><label>Attachment<input data-attribute-file data-file-id="${esc(item.attachment?.id)}"
      type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.gif"${disabled}></label>
      ${item.attachment ? `<a href="${base}/attachments/${esc(item.attachment.id)}">${esc(item.attachment.name)}</a>
      ${editable ? '<label><input type="checkbox" data-remove-attachment> Remove attachment</label>' : ''}` : ''}</div>
    </div>${state ? `<p role="status">${state}</p>` : ''}
    ${editable ? '<button type="button" data-remove-attribute>Remove attribute</button>' : ''}</fieldset>`;
}

export function attributeFields(record, editable, base) {
  const rows=record?.attributes??[];
  if (!rows.length && !editable) return '';
  return `<section data-attributes data-limit="${maxAttributes}" class="field-group">
    <h2 class="field-group-heading">${attributeColumn}</h2>
    <input type="hidden" name="${attributeColumn}" data-attribute-import value="${esc(attributeExport(rows))}">
    <div data-attribute-list>${rows.map(item=>row(item,editable,base,record?.status==='approved')).join('')}</div>
    ${editable ? `<template>${row({},true,base,false)}</template><button type="button" data-add-attribute>Add attribute</button>` : ''}
  </section>`;
}
