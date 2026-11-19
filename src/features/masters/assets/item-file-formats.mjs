import { needsCsvEscape, writeCsvTable, writeExcelTable } from './tabular-files.mjs';
import { findRecordSheet, maxBulkRows, readRecordRows } from './bulk-rows.mjs';

const headerKey = text => String(text ?? '').normalize('NFKC').trim().replace(/\s*\*$/, '').toLowerCase();
const hasContent = row => row.some(value => String(value ?? '').trim());

export function readItemTable(rows, names, decode = String) {
  const [headers, ...data] = rows.filter(hasContent);
  if (!headers || data.length !== 1) throw new Error('Use a header row followed by one record.');
  const known = new Map(names.map(name => [headerKey(name), name]));
  const values = new Map();
  headers.forEach((header, column) => {
    const name = known.get(headerKey(header));
    if (!name) return;
    if (values.has(name)) throw new Error('The file lists ' + name + ' twice.');
    values.set(name, decode(data[0][column] ?? ''));
  });
  if (![...values.values()].some(value => value.trim())) throw new Error('The file has no matching form values.');
  return values;
}

export function readItemCsv(bytes, names, { parse }) {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const rows = parse(text, { bom: true, skip_empty_lines: true, relax_column_count_less: true });
  return readItemTable(rows, names, value =>
    value.startsWith("'") && needsCsvEscape(value.slice(1)) ? value.slice(1) : value);
}

export function readRecordsCsv(bytes, fields, { parse }) {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const rows = parse(text, { bom: true, relax_column_count: true });
  return readRecordRows(rows.map(row => row.map(value => value.startsWith("'") && needsCsvEscape(value.slice(1)) ? value.slice(1) : value)), fields);
}

export function readRecordsExcel(bytes, fields, masterName, { read, utils }) {
  const signature = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 4));
  if (signature.length !== 4 || signature[0] !== 0x50 || signature[1] !== 0x4b || signature[2] !== 3 || signature[3] !== 4) {
    throw new Error('Choose an Excel workbook in .xlsx format.');
  }
  const workbook = read(bytes, { sheetRows: maxBulkRows + 20, dateNF: 'yyyy-mm-dd' });
  const name = findRecordSheet(workbook.SheetNames, masterName), sheet = workbook.Sheets[name];
  if (!sheet?.['!ref']) throw new Error('The worksheet ' + name + ' has no records.');
  const range = utils.decode_range(sheet['!ref']);
  if (range.e.c > 300) throw new Error('Use a worksheet with up to 300 columns.');
  sheet['!ref'] = utils.encode_range({ s: { r: 0, c: 0 }, e: range.e });
  return { sheet: name, ...readRecordRows(utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '', blankrows: true }), fields) };
}

export function writeItemCsv(values, csv) {
  return writeCsvTable([...values.keys()], [[...values.values()]], csv);
}

export function readItemExcel(bytes, names, { read, utils }) {
  const signature = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 4));
  if (signature.length !== 4 || signature[0] !== 0x50 || signature[1] !== 0x4b || signature[2] !== 3 || signature[3] !== 4) {
    throw new Error('Choose an Excel workbook in .xlsx format.');
  }
  const workbook = read(bytes, { sheets: 0, sheetRows: 51 });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet?.['!ref']) throw new Error('The first worksheet has no form values.');
  const range = utils.decode_range(sheet['!fullref'] ?? sheet['!ref']);
  if (range.e.r - range.s.r >= 50 || range.e.c - range.s.c >= 100) {
    throw new Error('Use the first worksheet for one record.');
  }
  return readItemTable(utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '', blankrows: false }), names);
}

export function writeItemExcel(values, xlsx, masterName = 'Item Master') {
  return writeExcelTable(masterName.slice(0, 31), [...values.keys()], [[...values.values()]], xlsx);
}

export async function readItemPdf(bytes, names, { PDFDocument, PDFTextField }) {
  const document = await PDFDocument.load(bytes);
  return readItemPdfFields(document, names, PDFTextField);
}

export function readItemPdfFields(document, names, PDFTextField) {
  const fields = new Map(document.getForm().getFields()
    .filter(field => field instanceof PDFTextField)
    .map(field => [field.getName(), field]));
  const values = new Map();
  for (const name of names) {
    const field = fields.get(name);
    if (field) values.set(name, field.getText() ?? '');
  }
  if (![...values.values()].some(value => value.trim())) {
    throw new Error('Choose a single-record Master Data PDF or a filled Diesel form PDF.');
  }
  return values;
}

export async function writeItemPdf(values, { PDFDocument, rgb }, fontkit, fontBytes, masterName = 'Item Master') {
  const document = await PDFDocument.create();
  document.setTitle('Diesel ' + masterName);
  document.registerFontkit(fontkit);
  const font = await document.embedFont(fontBytes);
  const form = document.getForm();
  const fields = [...values];
  const perPage = 15;
  for (let start = 0; start < fields.length; start += perPage) {
    const page = document.addPage([595.28, 841.89]);
    page.drawText('Diesel ' + masterName, { x: 42, y: 796, size: 18, font });
    fields.slice(start, start + perPage).forEach(([name, value], index) => {
      const y = 735 - index * 46;
      page.drawText(name, { x: 42, y: y + 25, size: 10, font });
      const field = form.createTextField(name);
      field.setText(value || undefined);
      field.addToPage(page, {
        x: 42, y, width: 511, height: 21, font, borderWidth: 1,
        borderColor: rgb(.72, .74, .8), backgroundColor: rgb(.97, .98, .99),
      });
    });
  }
  form.updateFieldAppearances(font);
  return document.save();
}
