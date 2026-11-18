function fieldControl(field, id) {
  const required = field.required && !field.readOnly && field.type !== 'file' ? ' required' : '';
  const description = field.hint ? ` aria-describedby="${id}-hint"` : '';
  const attributes = `id="${id}"${required}${description}${field.key ? ` data-field-key="${field.key}"` : ''}`;
  let control;
  if (field.type === 'file') {
    control = `<input ${attributes} type="text" disabled placeholder="Attachments are disabled in this preview">`;
  } else if (field.options) {
    const options = field.options.map(option => `<option>${option}</option>`).join('');
    control = `<select ${attributes}><option value="">Select…</option>${options}</select>`;
  } else if (field.type === 'textarea') {
    control = `<textarea ${attributes} rows="3"></textarea>`;
  } else {
    const list = field.suggestions ? ` list="${id}-options"` : '';
    const step = field.type === 'number' ? ` step="${field.step ?? 'any'}"` : '';
    control = `<input ${attributes} type="${field.type || 'text'}"${step}${list}${field.readOnly ? ' readonly' : ''}>`;
    if (field.suggestions) {
      control += `<datalist id="${id}-options">${field.suggestions.map(value => `<option value="${value}"></option>`).join('')}</datalist>`;
    }
  }
  const hint = field.hint ? `<small id="${id}-hint" class="field-hint">${field.hint}</small>` : '';
  return `<div class="master-field"><label for="${id}">${field.label}${field.required ? ' <span class="required-mark" aria-hidden="true">*</span>' : ''}</label>${control}${hint}</div>`;
}

export function masterForm({ slug, sections }) {
  const groups = sections.map(({ name, fields }, groupIndex) => {
    return `<details class="field-group" open>
      <summary><span>${name}</span><span class="field-count">${fields.length} fields</span></summary>
      <div class="field-grid">${fields.map((field, index) => fieldControl(field, `${slug}-${groupIndex}-${index}`)).join('')}</div>
    </details>`;
  });
  const storageChecks = slug === 'storage-location-master' ? '<script type="module" src="/masters/assets/storage-location.js"></script>' : '';
  const rateScript = slug === 'diesel-rate-master' ? '<script type="module" src="/masters/assets/diesel-rate.js"></script>' : '';
  return `${storageChecks}${rateScript}<form class="master-form" autocomplete="off" novalidate>
    <p class="required-key"><span class="required-mark" aria-hidden="true">*</span> Required fields</p>
    ${groups.join('\n')}
    <div class="form-footer"><button type="button" data-check-fields>Check fields</button><output aria-live="polite"></output></div>
  </form>`;
}
