import { fileAssets } from '/masters/assets/file-download.mjs';
import { openImportedRecord } from '/masters/assets/import-draft.mjs';
import { readItemPdfFields, readRecordsCsv, readRecordsExcel } from '/masters/assets/item-file-formats.mjs';
import { showBulkImport } from './bulk-import.js';
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

const fields = JSON.parse(input.dataset.fields);

// Excel and CSV may hold many records. A PDF always holds one.
async function readRecords(bytes) {
  if (extension === 'xlsx') return readRecordsExcel(bytes, fields, input.dataset.masterName, await import(fileAssets + 'xlsx.mjs'));
  if (extension === 'csv') return readRecordsCsv(bytes, fields, await import(fileAssets + 'csv-parse.mjs'));
  const { PDFDocument, PDFTextField } = await import(fileAssets + 'pdf-lib.mjs');
  const document = await PDFDocument.load(bytes);
  const values = readSavedRecordPdf(document, input.dataset.master, columns) ?? readItemPdfFields(document, columns, PDFTextField);
  return { records: [{ row: 1, values: [...values] }], unused: [] };
}

input.addEventListener('change', async () => {
  const [file] = input.files;
  if (!file) return;
  for (const button of buttons) button.disabled = true;
  feedback.textContent = 'Reading file…';
  try {
    if (file.size > 2 * 1024 * 1024) throw new Error('Choose a file up to 2 MiB.');
    if (!file.name.toLowerCase().endsWith('.' + extension)) throw new Error('Choose a .' + extension + ' file.');
    const found = await readRecords(await file.arrayBuffer());
    const openInForm = values => openImportedRecord(input.dataset.reviewUrl, input.dataset.scope, new Map(values));
    if (found.records.length === 1) return openInForm(found.records[0].values);
    if (!input.dataset.api) throw new Error('Use a header row followed by one record.');
    feedback.textContent = '';
    showBulkImport({ ...found, file: file.name, openInForm, ...input.dataset });
  } catch (error) {
    feedback.textContent = error.message;
  } finally {
    for (const button of buttons) button.disabled = false;
  }
});
