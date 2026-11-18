function fileButtons(direction) {
  return [['Excel', 'xlsx'], ['CSV', 'csv'], ['PDF', 'pdf']].map(([label, format]) => {
    return `<button type="button" data-${direction}="${format}" aria-label="${direction === 'import' ? 'Import' : 'Export'} ${label}">${label}</button>`;
  }).join('');
}

export function itemFileMenu(editable) {
  return `<div class="item-file-tools">
    <details id="item-file-menu">
      <summary>${editable ? 'Import and export' : 'Export'}</summary>
      <div class="item-file-options">
        ${editable ? `<div role="group" aria-label="Import"><span>Import</span>${fileButtons('import')}</div>` : ''}
        <div role="group" aria-label="Export"><span>Export</span>${fileButtons('export')}</div>
      </div>
    </details>
    ${editable ? '<button class="item-save" type="submit" form="record-form" name="item-save">Save</button><input id="item-file-input" type="file" hidden>' : ''}
  </div>`;
}
