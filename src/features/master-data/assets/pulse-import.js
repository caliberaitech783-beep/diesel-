import { fileAssets } from '/masters/assets/file-download.mjs';
import { pulseImportRows } from './pulse-import-rows.mjs';

const input = document.querySelector('#pulse-import-file');
const status = document.querySelector('#pulse-import-status');
input?.addEventListener('change', async () => {
  const [file] = input.files;
  if (!file) return;
  status.textContent = 'Reading ' + file.name + '…';
  try {
    const bytes = await file.arrayBuffer();
    let rows;
    if (/\.xlsx$/i.test(file.name)) {
      const { read, utils } = await import(fileAssets + 'xlsx.mjs');
      const workbook = read(bytes, { sheetRows: 5020, dateNF: 'yyyy-mm-dd' });
      rows = utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, raw: false, defval: '', blankrows: false });
    } else if (/\.csv$/i.test(file.name)) {
      const { parse } = await import(fileAssets + 'csv-parse.mjs');
      rows = parse(new TextDecoder().decode(bytes), { bom: true, relax_column_count: true });
    } else throw new Error('Choose a .csv or .xlsx file.');
    const records = pulseImportRows(rows, JSON.parse(input.dataset.columns));
    if (!records.length) throw new Error('The file has no records.');
    const response = await fetch('/pulse-masters/import', { method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ master: input.dataset.master, records }) });
    const reply = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(reply.error ?? 'The import could not be saved. Try again.');
    location.assign('/pulse-masters?' + new URLSearchParams({ master: input.dataset.master, done: reply.message }));
  } catch (error) {
    status.textContent = error.message;
  } finally { input.value = ''; }
});
