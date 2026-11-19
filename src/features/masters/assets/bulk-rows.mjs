// Reads many master records from a spreadsheet: a Diesel export, or a sheet of the master templates workbook
// with title rows above the header and one record per row below it.
const headerKey = text => String(text ?? '').normalize('NFKC').trim().replace(/\s*\*$/, '').replace(/\s+/g, ' ').toLowerCase();
const content = value => String(value ?? '').trim();
// A typed hyphen matches the dash in a post name such as Head – Procurement.
const choiceKey = text => text.toLowerCase().replace(/\s*[‐‑–—-]\s*/g, '-').replace(/\s+/g, ' ');
export const maxBulkRows = 500;

export function findRecordSheet(sheetNames, masterName) {
  const wanted = headerKey(masterName), short = wanted.replace(/\s*\(.*\)$/, '');
  return sheetNames.find(name => headerKey(name) === wanted) ?? sheetNames.find(name => headerKey(name) === short) ?? sheetNames[0];
}

function columnsFor(headers, fields) {
  const byKey = new Map(fields.map(field => [headerKey(field.key), field]));
  const byLabel = new Map();
  for (const field of fields) byLabel.set(headerKey(field.label), [...(byLabel.get(headerKey(field.label)) ?? []), field]);
  const seen = new Map(), used = new Set(), columns = [];
  headers.forEach((header, column) => {
    const key = headerKey(header);
    if (!key) return;
    const position = seen.get(key) ?? 0;
    seen.set(key, position + 1);
    const field = byKey.get(key) ?? byLabel.get(key)?.[position];
    if (field && !used.has(field.key)) { used.add(field.key); columns.push([column, field]); }
  });
  return columns;
}

function fieldValue(field, raw) {
  const text = content(raw);
  if (!text) return '';
  if (field.options) return field.options.find(option => choiceKey(option) === choiceKey(text)) ?? text;
  if (field.type === 'number') return /^[+-]?[\d,]*\.?\d+$/.test(text) ? text.replaceAll(',', '').replace(/^\+/, '') : text;
  if (field.type === 'date') {
    const indian = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(text);
    return indian ? [indian[3], indian[2].padStart(2, '0'), indian[1].padStart(2, '0')].join('-') : text;
  }
  return text;
}

export function readRecordRows(rows, fields) {
  let best = { index: -1, columns: [] };
  rows.slice(0, 12).forEach((row, index) => {
    const columns = columnsFor(row, fields);
    if (columns.length > best.columns.length) best = { index, columns };
  });
  if (best.columns.length < Math.min(2, fields.length)) throw new Error('The file has no header row matching this master’s field names.');
  const matched = new Set(best.columns.map(([column]) => column));
  const unused = rows[best.index].map(content).filter((header, column) => header && !matched.has(column));
  const records = [];
  rows.slice(best.index + 1).forEach((row, offset) => {
    const values = best.columns.map(([column, field]) => [field.key, fieldValue(field, row[column])]).filter(([, value]) => value);
    if (values.length) records.push({ row: best.index + offset + 2, values });
  });
  if (!records.length) throw new Error('The file has no records below its header row.');
  if (records.length > maxBulkRows) throw new Error('Import up to ' + maxBulkRows + ' records at a time.');
  return { records, unused };
}
