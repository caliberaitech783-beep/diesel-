const attributeRows = form => [...form.querySelectorAll('[data-attribute-row]')];
const value = (row, key) => row.querySelector('[data-attribute-'+key+']').value;
const fields = row => ({
  name:value(row,'name'),value:value(row,'value'),reference:value(row,'reference'),
  validFrom:value(row,'from'),validTo:value(row,'to'),
});

export function setupAttributeInputs(form) {
  const section=form.querySelector('[data-attributes]');
  const template=section?.querySelector('template');
  if (!template) return;
  const hidden=section.querySelector('[data-attribute-import]');
  const list=section.querySelector('[data-attribute-list]');
  const add=section.querySelector('[data-add-attribute]');
  const limit=Number(section.dataset.limit);
  function refresh() {
    const rows=attributeRows(form);
    add.disabled=rows.length>=limit;
    hidden.value=rows.length ? JSON.stringify(rows.map(row=>{
      const file=row.querySelector('[data-attribute-file]').files[0]?.name
        ?? (!row.querySelector('[data-remove-attachment]')?.checked ? row.querySelector('a')?.textContent : undefined);
      return { ...fields(row),...(file ? {attachmentName:file} : {}) };
    })) : '';
  }
  function append(record={}) {
    list.append(template.content.cloneNode(true));
    const row=list.lastElementChild;
    for (const [key,property] of [['name','name'],['value','value'],['reference','reference'],['from','validFrom'],['to','validTo']]) {
      row.querySelector('[data-attribute-'+key+']').value=String(record[property]??'');
    }
    return row;
  }
  add.addEventListener('click',()=>{
    if (attributeRows(form).length>=limit) return;
    append().querySelector('select').focus();
    refresh();
  });
  section.addEventListener('click',event=>{
    if (!event.target.closest('[data-remove-attribute]') || !event.target.closest('[data-attribute-row]')) return;
    event.target.closest('[data-attribute-row]').remove();
    refresh();
    add.focus();
  });
  section.addEventListener('input',event=>{
    if (event.target===hidden) {
      const imported=JSON.parse(hidden.value||'[]');
      list.replaceChildren();
      imported.forEach(append);
    }
    refresh();
  });
  section.addEventListener('change',refresh);
}

export async function collectAttributes(form,readFile) {
  if (!form.querySelector('[data-attributes]')) return undefined;
  const values=[];
  for (const row of attributeRows(form)) {
    const control=row.querySelector('[data-attribute-file]');
    const saved=control.dataset.fileId && !row.querySelector('[data-remove-attachment]')?.checked;
    const attachment=control.files.length ? await readFile(control.files[0]) : saved ? {id:control.dataset.fileId} : undefined;
    values.push({ ...fields(row),id:row.dataset.id||undefined,attachment });
  }
  return values;
}
