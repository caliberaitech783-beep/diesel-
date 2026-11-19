const draftKey = 'diesel-master-import';
const fragment = '#imported-record';

export function fillImportedFields(form, values) {
  const fields = new Map([...form.elements]
    .filter(control => control.name && control.matches('input:not([type="file"], [type="hidden"]), select, textarea, [data-attribute-import]'))
    .map(control => [control.name, control]));
  const changes = [];
  for (const [name, value] of values) {
    const control = fields.get(name);
    if (!control || control.disabled || control.readOnly) continue;
    const copy = control.cloneNode(true);
    const trimmed = value.trim();
    if (trimmed && control.matches('[data-attribute-import]')) {
      let attributes;
      try { attributes=JSON.parse(trimmed); } catch { /* Report a clear import error below. */ }
      if (!Array.isArray(attributes) || attributes.length>Number(control.closest('[data-attributes]').dataset.limit)
        || attributes.some(attribute=>!attribute || typeof attribute!=='object' || Array.isArray(attribute)
          || ['name','value','reference','validFrom','validTo'].some(key=>attribute[key]!=null && typeof attribute[key]!=='string'))) {
        throw new Error('Use the dated attributes column from a Diesel export.');
      }
    }
    if (control.matches('select')) {
      copy.value = [...control.options].find(option => option.value.toLowerCase() === trimmed.toLowerCase())?.value ?? '';
    } else {
      copy.value = control.type === 'number' ? trimmed.replace(/^\+/, '') : value;
    }
    if (trimmed && !copy.value) throw new Error('Enter a valid value for ' + name + ' in the file.');
    changes.push([control, copy.value]);
  }
  for (const [control, value] of changes) {
    control.value = value;
    control.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

export function openImportedRecord(url, scope, values) {
  sessionStorage.setItem(draftKey, JSON.stringify({ scope, values: [...values] }));
  location.assign(url + fragment);
}

export function restoreImportedRecord(form) {
  if (location.hash !== fragment || !form.dataset.importScope || form.dataset.record) return;
  history.replaceState(history.state, '', location.pathname + location.search);
  const status = form.querySelector('output');
  try {
    const saved = sessionStorage.getItem(draftKey);
    sessionStorage.removeItem(draftKey);
    const draft = JSON.parse(saved);
    if (draft?.scope !== form.dataset.importScope) throw new Error('Import the file again from Master Data.');
    fillImportedFields(form, draft.values);
    status.textContent = 'Review the imported fields, then select Save for review.';
  } catch (error) {
    status.textContent = error.message;
  }
}
