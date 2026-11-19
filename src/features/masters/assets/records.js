import { restoreImportedRecord } from './import-draft.mjs';
import { collectAttributes, setupAttributeInputs } from './attribute-fields.js';

const form = document.querySelector('#record-form');

function readFile(file) {
  if (file.size > 5 * 1024 * 1024) throw new Error('Choose a file up to 5 MiB.');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.onload = () => resolve({ name: file.name, base64: String(reader.result).split(',')[1] });
    reader.readAsDataURL(file);
  });
}

async function save(action) {
  if (form.dataset.importing) return;
  const status = form.querySelector('output');
  const buttons = [...form.elements].filter(control => control.tagName === 'BUTTON');
  const reason = form.querySelector('#change-reason');
  if (reason && action !== 'approve' && !reason.reportValidity()) return;
  if (!action && !form.reportValidity()) return;
  for (const button of buttons) button.disabled = true;
  status.textContent = 'Saving…';
  try {
    const { api, record, revision, writeScope, recordHome } = form.dataset;
    const payload = { revision: Number(revision), reason: reason?.value, scope:writeScope };
    if (!action) {
      payload.values = {};
      for (const control of form.querySelectorAll('[name]')) {
        if (control.disabled || control.matches('[data-attribute-import]')) continue;
        if (control.type === 'file') {
          if (control.files.length) payload.values[control.name] = await readFile(control.files[0]);
          else if (control.dataset.fileId && !form.querySelector(`[data-remove-for="${control.id}"]`)?.checked) {
            payload.values[control.name] = { id: control.dataset.fileId };
          }
        } else payload.values[control.name] = control.value;
      }
      payload.attributes=await collectAttributes(form,readFile);
    }
    const response = await fetch(action ? api + '/' + action : api, {
      method: action || !record ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'The record could not be saved.');
    const target = new URL(recordHome,location.origin);
    target.searchParams.set('id',result.id);
    location.assign(target);
  } catch (error) {
    status.textContent = error.message;
    for (const button of buttons) button.disabled = false;
  }
}

if (form) {
  setupAttributeInputs(form);
  restoreImportedRecord(form);
  form.addEventListener('submit', event => { event.preventDefault(); save(); });
  for (const button of form.querySelectorAll('[data-action]')) {
    button.addEventListener('click', () => save(button.dataset.action));
  }
}
