export function masterDataFileMenu(label, importing = false) {
  const attribute = importing ? 'data-import-format' : 'data-format';
  return `<details class="master-data-menu" name="master-data-file-actions">
    <summary>${label}</summary>
    <div>${[['CSV', 'csv'], ['Excel', 'xlsx'], ['PDF', 'pdf']].map(([name, format]) =>
      `<button type="button" ${attribute}="${format}" aria-label="${label} ${name}">${name}</button>`).join('')}</div>
  </details>`;
}
