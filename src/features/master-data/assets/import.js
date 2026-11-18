import { fileAssets } from '/masters/assets/file-download.mjs';
import { openImportedRecord } from '/masters/assets/import-draft.mjs';
import { readItemCsv, readItemExcel, readItemPdfFields } from '/masters/assets/item-file-formats.mjs';
import { readSavedRecordPdf } from './export-data.mjs';

const input = document.querySelector('#master-data-import-file');
const feedback = document.querySelector('.master-data-feedback');
const buttons = [...document.querySelectorAll('[data-import-format]')];
const columns = JSON.parse(input.dataset.columns);
let extension;

for (const button of buttons) {
  button.addEventListener('click', () => {
    extension = button.dataset.importFormat;
    const menu = button.closest('details');
    menu.open = false;
    menu.querySelector('summary').focus();
    input.accept = '.' + extension;
    input.value = '';
    input.click();
  });
}

async function readValues(bytes) {
  if (extension === 'xlsx') return readItemExcel(bytes, columns, await import(fileAssets + 'xlsx.mjs'));
  if (extension === 'csv') return readItemCsv(bytes, columns, await import(fileAssets + 'csv-parse.mjs'));
  const { PDFDocument, PDFTextField } = await import(fileAssets + 'pdf-lib.mjs');
  const document = await PDFDocument.load(bytes);
  return readSavedRecordPdf(document, input.dataset.master, columns) ?? readItemPdfFields(document, columns, PDFTextField);
}

input.addEventListener('change', async () => {
  const [file] = input.files;
  if (!file) return;
  for (const button of buttons) button.disabled = true;
  feedback.textContent = 'Reading file…';
  try {
    if (file.size > 2 * 1024 * 1024) throw new Error('Choose a file up to 2 MiB.');
    if (!file.name.toLowerCase().endsWith('.' + extension)) throw new Error('Choose a .' + extension + ' file.');
    const values = await readValues(await file.arrayBuffer());
    openImportedRecord(input.dataset.reviewUrl, input.dataset.scope, values);
  } catch (error) {
    feedback.textContent = error.message;
  } finally {
    for (const button of buttons) button.disabled = false;
  }
});
