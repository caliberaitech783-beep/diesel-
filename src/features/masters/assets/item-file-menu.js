import { readItemCsv, readItemExcel, readItemPdf, writeItemCsv, writeItemExcel, writeItemPdf } from './item-file-formats.mjs';
import { downloadFile, fileAssets as vendor, loadPdfAssets } from './file-download.mjs';
import { fillImportedFields } from './import-draft.mjs';

const form = document.querySelector('#record-form');
const fileTools = document.querySelector('.item-file-tools');
const picker = document.querySelector('#item-file-input');
const status = document.querySelector('#item-file-status');
const save = form.querySelector('[data-save-for-review]');
const saveStatus = form.querySelector('output');
const fields = new Map([...form.elements]
  .filter(control => control.name && control.matches('input:not([type="file"], [type="hidden"]), select, textarea'))
  .map(control => [control.name, control]));
const formats = {
  xlsx: {
    accept: '.xlsx',
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    async read(bytes, names) { return readItemExcel(bytes, names, await import(vendor + 'xlsx.mjs')); },
    async write(values) { return writeItemExcel(values, await import(vendor + 'xlsx.mjs'), form.dataset.masterName); },
  },
  csv: {
    accept: '.csv',
    type: 'text/csv;charset=utf-8',
    async read(bytes, names) { return readItemCsv(bytes, names, await import(vendor + 'csv-parse.mjs')); },
    async write(values) { return writeItemCsv(values, await import(vendor + 'csv-stringify.mjs')); },
  },
  pdf: {
    accept: '.pdf',
    type: 'application/pdf',
    async read(bytes, names) { return readItemPdf(bytes, names, await import(vendor + 'pdf-lib.mjs')); },
    async write(values) { return writeItemPdf(values, ...await loadPdfAssets(), form.dataset.masterName); },
  },
};

function closeMenu(menu, restoreFocus = false) {
  menu.open = false;
  if (restoreFocus) menu.querySelector('summary').focus();
}

let pendingFormat;
let working = false;
for (const button of fileTools.querySelectorAll('[data-import]')) {
  button.addEventListener('click', () => {
    if (working || save.disabled) return;
    pendingFormat = button.dataset.import;
    picker.accept = formats[pendingFormat].accept;
    picker.value = '';
    closeMenu(button.closest('details'), true);
    picker.click();
  });
}
picker?.addEventListener('change', async () => {
  const [file] = picker.files;
  if (!file || working || save.disabled) return;
  const format = formats[pendingFormat];
  working = true;
  save.disabled = true;
  form.dataset.importing = 'true';
  saveStatus.textContent = '';
  status.textContent = 'Importing…';
  try {
    if (file.size > 2 * 1024 * 1024) throw new Error('Choose a file up to 2 MiB.');
    if (!file.name.toLowerCase().endsWith(format.accept)) throw new Error('Choose a ' + format.accept + ' file.');
    const values = await format.read(await file.arrayBuffer(), [...fields.keys()]);
    fillImportedFields(form, values);
    status.textContent = 'Fields imported. Review them and select Save for review.';
  } catch (error) {
    const help = pendingFormat === 'pdf' ? ' Use a filled Diesel form PDF for this master.' : '';
    status.textContent = 'Could not import this file. ' + (error.message || 'Check the file and try again.') + help;
  } finally {
    working = false;
    save.disabled = false;
    delete form.dataset.importing;
  }
});

for (const button of fileTools.querySelectorAll('[data-export]')) {
  button.addEventListener('click', async () => {
    if (working) return;
    const format = formats[button.dataset.export];
    const values = new Map([...fields].map(([name, control]) => [name, control.value]));
    closeMenu(button.closest('details'), true);
    working = true;
    status.textContent = 'Preparing download…';
    try {
      const contents = await format.write(values);
      downloadFile(contents, format.type, form.dataset.slug + format.accept);
      status.textContent = '';
    } catch {
      status.textContent = 'Could not export this file. Please try again.';
    } finally {
      working = false;
    }
  });
}

fileTools.addEventListener('keydown', event => {
  const menu = event.target.closest('details[open]');
  if (event.key === 'Escape' && menu) closeMenu(menu, true);
});

document.addEventListener('click', event => {
  if (fileTools.contains(event.target)) return;
  const menu = fileTools.querySelector('details[open]');
  if (menu) closeMenu(menu);
});
