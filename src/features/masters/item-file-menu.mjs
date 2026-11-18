const fileFormats = [['Excel', 'xlsx'], ['CSV', 'csv'], ['PDF', 'pdf']];

function fileMenu(label, direction) {
  return `<details name="item-file-actions">
    <summary>${label}</summary>
    <div class="item-file-options">${fileFormats.map(([name, format]) =>
      `<button type="button" data-${direction}="${format}" aria-label="${label} ${name}">${name}</button>`).join('')}</div>
  </details>`;
}

export function itemFileMenu(editable) {
  return `<div class="item-file-tools">
    ${editable ? fileMenu('Import', 'import') : ''}
    ${fileMenu('Export', 'export')}
    ${editable ? '<input id="item-file-input" type="file" hidden>' : ''}
  </div>`;
}
