import { readItemCsv, readItemExcel, readItemPdf, writeItemCsv, writeItemExcel, writeItemPdf } from './item-file-formats.mjs';

const form = document.querySelector('#record-form');
const menu = document.querySelector('#item-file-menu');
const picker = document.querySelector('#item-file-input');
const status = document.querySelector('#item-file-status');
const save = form.elements.namedItem('item-save');
const fields = new Map([...form.elements]
  .filter(control => control.name && control.matches('input:not([type="file"], [type="hidden"]), select, textarea'))
  .map(control => [control.name, control]));
const vendor = '/masters/item-files/';
const formats = {
  xlsx: {
    accept: '.xlsx',
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    async read(bytes, names) { return readItemExcel(bytes, names, await import(vendor + 'xlsx.mjs')); },
    async write(values) { return writeItemExcel(values, await import(vendor + 'xlsx.mjs')); },
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
    async write(values) {
      const [pdf, , font] = await Promise.all([
        import(vendor + 'pdf-lib.mjs'),
        import(vendor + 'regenerator-runtime.mjs').then(() => import(vendor + 'fontkit.mjs')),
        fetch(vendor + 'item-font.ttf'),
      ]);
      if (!font.ok) throw new Error('The PDF font could not be loaded.');
      return writeItemPdf(values, pdf, globalThis.fontkit, await font.arrayBuffer());
    },
  },
};

function fillFields(values) {
  const changes = [];
  for (const [name, value] of values) {
    const control = fields.get(name);
    if (control.disabled || control.readOnly) continue;
    const copy = control.cloneNode(true);
    const trimmed = value.trim();
    if (control.matches('select')) {
      copy.value = [...control.options].find(option => option.value.toLowerCase() === trimmed.toLowerCase())?.value ?? '';
    } else {
      copy.value = control.type === 'number' ? trimmed.replace(/^\+/, '') : value;
    }
    if (value.trim() && !copy.value) throw new Error('Enter a valid value for ' + name + ' in the file.');
    changes.push([control, copy.value]);
  }
  for (const [control, value] of changes) control.value = value;
}

let pendingFormat;
let working = false;
for (const button of menu.querySelectorAll('[data-import]')) {
  button.addEventListener('click', () => {
    if (working || save.disabled) return;
    pendingFormat = button.dataset.import;
    picker.accept = formats[pendingFormat].accept;
    picker.value = '';
    picker.click();
  });
}
picker?.addEventListener('change', async () => {
  const [file] = picker.files;
  if (!file || working || save.disabled) return;
  const format = formats[pendingFormat];
  menu.open = false;
  working = true;
  save.disabled = true;
  form.dataset.importing = 'true';
  form.elements.namedItem('save-status').textContent = '';
  status.textContent = 'Importing…';
  try {
    if (file.size > 2 * 1024 * 1024) throw new Error('Choose a file up to 2 MiB.');
    if (!file.name.toLowerCase().endsWith(format.accept)) throw new Error('Choose a ' + format.accept + ' file.');
    const values = await format.read(await file.arrayBuffer(), [...fields.keys()]);
    fillFields(values);
    status.textContent = 'Item fields imported. Review them and select Save.';
  } catch (error) {
    const help = pendingFormat === 'pdf' ? ' Use a filled Item Master PDF exported from Diesel.' : '';
    status.textContent = 'Could not import this file. ' + (error.message || 'Check the file and try again.') + help;
  } finally {
    working = false;
    save.disabled = false;
    delete form.dataset.importing;
  }
});

for (const button of menu.querySelectorAll('[data-export]')) {
  button.addEventListener('click', async () => {
    if (working) return;
    const format = formats[button.dataset.export];
    const values = new Map([...fields].map(([name, control]) => [name, control.value]));
    menu.open = false;
    working = true;
    status.textContent = 'Preparing download…';
    try {
      const contents = await format.write(values);
      const href = URL.createObjectURL(new Blob([contents], { type: format.type }));
      const link = document.createElement('a');
      link.href = href;
      link.download = 'item-master' + format.accept;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      status.textContent = '';
    } catch {
      status.textContent = 'Could not export this file. Please try again.';
    } finally {
      working = false;
    }
  });
}

menu.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menu.open) {
    menu.open = false;
    menu.querySelector('summary').focus();
  }
});
