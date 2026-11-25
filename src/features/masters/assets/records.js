import { restoreImportedRecord } from './import-draft.mjs';
import { collectAttributes, setupAttributeInputs } from './attribute-fields.js';
import { setupRecordEditor } from './item-record-editor.js';

const form = document.querySelector('#record-form');
const embedded = document.body.classList.contains('record-dialog-page') && window.parent !== window;
const notify = data => { if (embedded) window.parent.postMessage(data,location.origin); };
const deletion = document.querySelector('.record-delete-confirm');
const editor = form?.dataset.slug === 'item-master' ? setupRecordEditor(form) : null;

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
  const status = action === 'delete' ? deletion.querySelector('output') : form.querySelector('output');
  const buttons = [...form.elements].filter(control => control.tagName === 'BUTTON');
  const reason = action === 'delete' ? deletion.querySelector('textarea') : form.querySelector('#change-reason');
  if (editor && action !== 'delete') { if (!editor.validate(action)) return; }
  else {
    if (reason && action !== 'approve' && !reason.reportValidity()) return;
    if (!action && !form.reportValidity()) return;
  }
  for (const button of buttons) button.disabled = true;
  delete status.dataset.error;
  delete status.dataset.saved;
  status.textContent = action === 'delete' ? 'Submitting deletion…' : 'Saving…';
  notify({type:'master-record-busy',busy:true});
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
    editor?.saved();
    const target = new URL(recordHome,location.origin);
    target.searchParams.set('id',result.id);
    notify({type:'master-record-busy',busy:false});
    if (embedded) {
      notify({type:'master-record-saved',message:action === 'delete' ? (result.status === 'deleted' ? 'Record deleted.' : 'Deletion sent for review.') : 'Record saved for review.'});
    } else if (action === 'delete') {
      location.assign(recordHome);
    } else location.assign(!action && !record && form.dataset.stayAfterSave ? form.dataset.stayAfterSave : target);
  } catch (error) {
    // A save that did not go through must be impossible to miss.
    status.dataset.error = 'true';
    status.textContent = (action ? '' : 'Not saved: ') + error.message;
    status.scrollIntoView({ block: 'center' });
    notify({type:'master-record-busy',busy:false});
    for (const button of buttons) button.disabled = false;
  }
}

if (form) {
  // A new record saved from this form: stay here on a blank form and say where the record went.
  const here = new URL(location.href);
  if (here.searchParams.get('saved') === '1' && form.dataset.stayAfterSave) {
    const saved = form.querySelector('output');
    if (saved) { saved.dataset.saved = 'true'; saved.textContent = 'Saved in ' + form.dataset.masterName + ' data. You can enter the next record.'; }
    here.searchParams.delete('saved');
    history.replaceState(null, '', here);
  }
  setupAttributeInputs(form);
  restoreImportedRecord(form);
  form.addEventListener('submit', event => { event.preventDefault(); save(); });
  for (const button of form.querySelectorAll('[data-action]')) {
    button.addEventListener('click', () => save(button.dataset.action));
  }
}

if (deletion) {
  form.querySelector('[data-delete-record]')?.addEventListener('click', () => {
    deletion.querySelector('textarea').value = form.querySelector('#change-reason')?.value ?? '';
    deletion.querySelector('output').textContent = '';
    deletion.showModal();
    deletion.querySelector('textarea').focus();
  });
  deletion.querySelector('[data-confirm-delete]').addEventListener('click', async () => {
    const button = deletion.querySelector('[data-confirm-delete]');
    if (button.disabled) return;
    button.disabled = true;
    try { await save('delete'); } finally { button.disabled = false; }
  });
}
