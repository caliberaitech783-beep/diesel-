const headerKey = text => String(text ?? '').normalize('NFKC').trim().replace(/\s*\*$/, '').toLowerCase();
const hasContent = row => row.some(value => String(value ?? '').trim());
const formula = /^[\s\uFEFF]*[=+\-@＝＋－＠]|^[\t\r]/u;
const dangerous = text => text.startsWith("'") || formula.test(text);

export function readItemTable(rows, names, decode = String) {
  const [headers, ...data] = rows.filter(hasContent);
  if (!headers || data.length !== 1) throw new Error('Use an Item Master header row followed by one item.');
  const known = new Map(names.map(name => [headerKey(name), name]));
  const values = new Map();
  headers.forEach((header, column) => {
    const name = known.get(headerKey(header));
    if (!name) return;
    if (values.has(name)) throw new Error('The file lists ' + name + ' twice.');
    values.set(name, decode(data[0][column] ?? ''));
  });
  if (![...values.values()].some(value => value.trim())) throw new Error('The file has no Item Master values.');
  return values;
}

export function readItemCsv(bytes, names, { parse }) {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const rows = parse(text, { bom: true, skip_empty_lines: true, relax_column_count_less: true });
  return readItemTable(rows, names, value =>
    value.startsWith("'") && dangerous(value.slice(1)) ? value.slice(1) : value);
}

export function writeItemCsv(values, { stringify }) {
  const data = [...values.values()].map(value => dangerous(value) ? "'" + value : value);
  return stringify([[...values.keys()], data], { bom: true, record_delimiter: 'windows' });
}

export function readItemExcel(bytes, names, { read, utils }) {
  const signature = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 4));
  if (signature.length !== 4 || signature[0] !== 0x50 || signature[1] !== 0x4b || signature[2] !== 3 || signature[3] !== 4) {
    throw new Error('Choose an Excel workbook in .xlsx format.');
  }
  const workbook = read(bytes, { sheets: 0, sheetRows: 51 });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet?.['!ref']) throw new Error('The first worksheet has no Item Master values.');
  const range = utils.decode_range(sheet['!fullref'] ?? sheet['!ref']);
  if (range.e.r - range.s.r >= 50 || range.e.c - range.s.c >= 100) {
    throw new Error('Use the first worksheet for one Item Master item.');
  }
  return readItemTable(utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '', blankrows: false }), names);
}

export function writeItemExcel(values, { utils, write }) {
  const workbook = utils.book_new();
  const columns = [...values.keys()];
  const sheet = utils.aoa_to_sheet([columns, [...values.values()]]);
  sheet['!cols'] = columns.map(name => ({ wch: Math.max(16, name.length + 3) }));
  utils.book_append_sheet(workbook, sheet, 'Item Master');
  return write(workbook, { bookType: 'xlsx', type: 'array', compression: true });
}

export async function readItemPdf(bytes, names, { PDFDocument, PDFTextField }) {
  const document = await PDFDocument.load(bytes);
  const fields = new Map(document.getForm().getFields()
    .filter(field => field instanceof PDFTextField)
    .map(field => [field.getName(), field]));
  const values = new Map();
  for (const name of names) {
    const field = fields.get(name);
    if (field) values.set(name, field.getText() ?? '');
  }
  if (![...values.values()].some(value => value.trim())) {
    throw new Error('Fill in and save an Item Master PDF exported from Diesel.');
  }
  return values;
}

export async function writeItemPdf(values, { PDFDocument, rgb }, fontkit, fontBytes) {
  const document = await PDFDocument.create();
  document.setTitle('Diesel Item Master');
  document.registerFontkit(fontkit);
  const font = await document.embedFont(fontBytes);
  const form = document.getForm();
  const fields = [...values];
  const perPage = 15;
  for (let start = 0; start < fields.length; start += perPage) {
    const page = document.addPage([595.28, 841.89]);
    page.drawText('Diesel Item Master', { x: 42, y: 796, size: 18, font });
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
