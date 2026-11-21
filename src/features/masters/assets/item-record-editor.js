import { draftKey, readDraft } from './record-drafts.mjs';

export function setupRecordEditor(form) {
  const editable = form.dataset.editable === 'true';
  const controls = [...form.querySelectorAll('[name], #change-reason')];
  const state = form.querySelector('[data-save-state]');
  const summary = form.querySelector('#error-summary');
  const status = form.querySelector('output');
  const notice = form.querySelector('#draft-notice');
  const message = notice.querySelector('p');
  const restore = notice.querySelector('[data-restore-draft]');
  const key = draftKey(form.dataset);
  let draft;
  let submitting = false;
  let validated = false;
  const values = () => Object.fromEntries([
    ...controls.filter(control => !control.disabled && control.type !== 'file').map(control => [control.name || control.id, control.value]),
    ...[...form.querySelectorAll('[data-remove-for]')].map(control => ['remove:' + control.dataset.removeFor, String(control.checked)]),
  ]);
  const fingerprint = () => JSON.stringify({ site: form.dataset.site, values: values(), files: controls.filter(control => control.type === 'file').map(control => [...control.files].map(file => [file.name, file.size, file.lastModified])), remove: [...form.querySelectorAll('[data-remove-for]')].map(control => control.checked) });
  let persisted = fingerprint();

  function rules() {
    for (const control of controls) control.setCustomValidity('');
    const field = name => form.elements.namedItem(name);
    const positive = name => { const control = field(name); if (control?.value && Number(control.value) <= 0) control.setCustomValidity('Enter a value greater than zero.'); };
    if (form.dataset.slug === 'item-master') {
      ['Density minimum (kg/m³)', 'Density maximum (kg/m³)', 'Bulk Density'].forEach(positive);
      const min = field('Density minimum (kg/m³)'), max = field('Density maximum (kg/m³)');
      if (min.value && max.value && Number(max.value) < Number(min.value)) max.setCustomValidity('Maximum density must be at least the minimum density.');
    }
  }

  function showErrors(invalid, focus = false) {
    for (const control of controls) {
      const error = document.getElementById(control.id + '-error');
      if (!error) continue;
      const failed = invalid.includes(control);
      error.hidden = !failed;
      error.textContent = failed ? (control.validity.valueMissing ? 'Complete this required field.' : control.validationMessage) : '';
      if (failed) control.setAttribute('aria-invalid', 'true'); else control.removeAttribute('aria-invalid');
    }
    const list = summary.querySelector('ul');
    list.replaceChildren();
    for (const control of invalid) {
      const li = document.createElement('li'), link = document.createElement('a');
      link.href = '#' + control.id;
      link.textContent = (control.labels?.[0]?.textContent.replace('*', '').trim() || 'Field') + ': ' + document.getElementById(control.id + '-error').textContent;
      link.addEventListener('click', event => { event.preventDefault(); control.scrollIntoView({ block: 'center' }); control.focus({ preventScroll: true }); });
      li.append(link); list.append(li);
    }
    summary.hidden = !invalid.length;
    if (focus && invalid.length) { summary.scrollIntoView({ block: 'start' }); summary.focus({ preventScroll: true }); }
    return !invalid.length;
  }

  function validate(action) {
    rules();
    const relevant = action ? (action === 'approve' ? [] : controls.filter(control => control.id === 'change-reason')) : controls;
    validated = !action;
    return showErrors(relevant.filter(control => control.willValidate && !control.validity.valid && !control.closest('[hidden]')), true);
  }

  function review() {
    const body = form.querySelector('[data-review-rows]');
    body.replaceChildren();
    for (const group of form.querySelectorAll('[data-compare-value]')) {
      const control = group.querySelector('[name]');
      let value = control.type === 'file' ? control.files[0]?.name || control.dataset.savedName || '' : control.value;
      if (control.type === 'file' && group.querySelector('[data-remove-for]')?.checked) value = '';
      const before = group.dataset.compareValue;
      if (value === before) continue;
      const row = document.createElement('tr');
      [group.dataset.label, before || '—', value || '—'].forEach((text, index) => {
        const cell = document.createElement(index === 0 ? 'th' : 'td');
        if (!index) cell.scope = 'row';
        cell.textContent = text; row.append(cell);
      });
      body.append(row);
    }
    body.closest('.comparison-table').hidden = !body.children.length;
    form.querySelector('[data-review-empty]').hidden = Boolean(body.children.length);
    for (const section of form.querySelectorAll('[data-section-completion]')) {
      const required = [...section.closest('.field-group').querySelectorAll('[required]')].filter(control => !control.disabled && !control.closest('[hidden]'));
      const complete = required.filter(control => control.value && control.validity.valid).length;
      section.textContent = editable && required.length ? `${complete} / ${required.length} required` : '';
    }
  }

  function updated() {
    rules(); review();
    state.textContent = fingerprint() !== persisted ? 'Unsaved changes' : editable ? 'Not submitted for review' : 'Viewing saved record';
    if (validated) showErrors(controls.filter(control => control.willValidate && !control.validity.valid && !control.closest('[hidden]')));
  }

  function offerDraft() {
    draft = null;
    notice.hidden = true;
    try {
      draft = readDraft(localStorage.getItem(key), form.dataset.revision);
      if (draft) {
        notice.hidden = false;
        restore.hidden = draft.stale;
        message.textContent = draft.stale ? 'A draft from an older revision is saved here. It cannot replace this newer record.'
          : `Local draft saved ${new Date(draft.savedAt).toLocaleString('en-IN')}. Restore it to continue. Attachments must be selected again.`;
      }
    } catch { status.textContent = 'Local drafts are unavailable or unreadable. You can still save for review.'; }
  }

  if (editable) {
    offerDraft();
    form.querySelector('[data-save-draft]').addEventListener('click', () => {
      try {
        draft = { version: 1, revision: form.dataset.revision, values: values(), files: controls.filter(control => control.type === 'file').flatMap(control => [...control.files].map(file => file.name)), savedAt: new Date().toISOString() };
        localStorage.setItem(key, JSON.stringify(draft));
        persisted = fingerprint();
        state.textContent = 'Draft saved on this browser';
        status.textContent = 'Draft saved locally. It has not been sent for review. Attachments must be selected again after reopening.';
        notice.hidden = true;
      } catch { status.textContent = 'The local draft could not be saved. Keep this form open or save for review.'; }
    });
    restore.addEventListener('click', () => {
      if (!draft || draft.stale) return;
      for (const control of controls) {
        if (control.disabled || control.type === 'file') continue;
        const name = control.name || control.id;
        if (Object.hasOwn(draft.values, name)) control.value = draft.values[name];
      }
      for (const control of form.querySelectorAll('[data-remove-for]')) control.checked = draft.values['remove:' + control.dataset.removeFor] === 'true';
      form.dispatchEvent(new Event('draft-restored'));
      form.dispatchEvent(new Event('input', { bubbles: true }));
      persisted = fingerprint(); state.textContent = 'Local draft restored'; notice.hidden = true;
      status.textContent = draft.files.length ? 'Draft restored. Select these attachments again: ' + draft.files.join(', ') : 'Draft restored. Check your details before saving for review.';
    });
    form.querySelector('[data-discard-draft]').addEventListener('click', () => {
      try { localStorage.removeItem(key); draft = null; notice.hidden = true; status.textContent = 'Local draft discarded.'; }
      catch { status.textContent = 'The local draft could not be discarded.'; }
    });
    window.addEventListener('beforeunload', event => {
      if (!submitting && fingerprint() !== persisted) { event.preventDefault(); event.returnValue = ''; }
    });
  }

  for (const control of controls.filter(control => control.type === 'file')) {
    const group = control.closest('.master-field');
    const download = group.querySelector('a');
    control.dataset.savedName = download ? download.textContent.replace(/^Download /, '') : '';
    let objectUrl;
    const preview = document.createElement('div'); group.append(preview);
    async function showPreview(file) {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      preview.replaceChildren();
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) { status.textContent = 'Choose a file up to 5 MiB.'; return; }
      const name = file.name || control.dataset.savedName;
      const type = name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : file.type;
      if (type !== 'application/pdf' && !/^image\/(png|jpeg|webp|gif)$/.test(type)) return;
      objectUrl = URL.createObjectURL(new Blob([file], { type }));
      const link = document.createElement('a');
      link.href = objectUrl; link.target = '_blank'; link.rel = 'noopener'; link.className = 'file-preview-link'; link.textContent = 'Open preview · ' + name;
      preview.append(link);
      if (type.startsWith('image/')) { const image = document.createElement('img'); image.src = objectUrl; image.alt = 'Attachment preview: ' + name; image.className = 'file-preview'; preview.append(image); }
    }
    control.addEventListener('change', () => { showPreview(control.files[0]); });
    if (download) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'preview-attachment'; button.textContent = 'Preview attachment';
      button.addEventListener('click', async () => {
        try {
          const response = await fetch(download.href);
          if (!response.ok) throw new Error('The attachment could not be opened.');
          const blob = await response.blob();
          const name = control.dataset.savedName, suffix = name.split('.').at(-1).toLowerCase();
          await showPreview(new File([blob], name, { type: ({ png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', webp:'image/webp', gif:'image/gif', pdf:'application/pdf' })[suffix] || '' }));
        } catch (error) { status.textContent = error.message; }
      });
      group.append(button);
    }
    window.addEventListener('pagehide', () => { if (objectUrl) URL.revokeObjectURL(objectUrl); });
  }

  const links = [...document.querySelectorAll('.form-outline a')];
  if (links.length && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      const entry = entries.filter(item => item.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (!entry) return;
      for (const link of links) { if (link.hash === '#' + entry.target.id) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current'); }
    }, { rootMargin: '-5% 0px -65% 0px' });
    for (const link of links) { const section = document.querySelector(link.hash); if (section) observer.observe(section); }
  }
  form.addEventListener('input', updated);
  form.addEventListener('change', updated);
  updated();
  return {
    validate,
    saved() { submitting = true; try { localStorage.removeItem(key); } catch { /* The server save succeeded. */ } },
  };
}


