import { downloadFile, fileAssets, loadPdfAssets } from '/masters/assets/file-download.mjs';
import { writeCsvTable, writeExcelTable } from '/masters/assets/tabular-files.mjs';
import { exportTable, fitExcelCells, writeMasterDataPdf } from './export-data.mjs';

const menu = document.querySelector('.master-data-download');
const feedback = document.querySelector('.master-data-feedback');
const buttons = [...menu.querySelectorAll('[data-format]')];
const formats = {
  xlsx: {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    async write(records, showSite, formColumns) {
      const { columns, rows } = fitExcelCells(exportTable(records, showSite, formColumns));
      return writeExcelTable('Master Data', columns, rows, await import(fileAssets + 'xlsx.mjs'));
    },
  },
  csv: {
    type: 'text/csv;charset=utf-8',
    async write(records, showSite, formColumns) {
      const { columns, rows } = exportTable(records, showSite, formColumns);
      return writeCsvTable(columns, rows, await import(fileAssets + 'csv-stringify.mjs'));
    },
  },
  pdf: {
    type: 'application/pdf',
    async write(records, showSite, formColumns) {
      return writeMasterDataPdf(records, showSite, ...await loadPdfAssets(), formColumns);
    },
  },
};

for (const button of buttons) {
  button.addEventListener('click', async () => {
    for (const control of buttons) control.disabled = true;
    const extension = button.dataset.format;
    menu.open = false;
    feedback.textContent = 'Preparing download…';
    try {
      const response = await fetch(menu.dataset.exportSource);
      if (response.status === 401) throw new Error('Sign in again to download Master Data.');
      if (!response.ok) throw new Error('Master Data could not be loaded. Try again.');
      const { records, showSite, columns } = await response.json();
      const format = formats[extension];
      downloadFile(await format.write(records, showSite, columns), format.type, 'master-data.' + extension);
      feedback.textContent = '';
    } catch (error) {
      feedback.textContent = error.message;
    } finally {
      for (const control of buttons) control.disabled = false;
    }
  });
}

menu.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menu.open) {
    menu.open = false;
    menu.querySelector('summary').focus();
  }
});
