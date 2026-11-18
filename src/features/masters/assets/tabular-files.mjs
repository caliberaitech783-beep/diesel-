const formula = /^[\s\uFEFF]*[=+\-@＝＋－＠]|^[\t\r]/u;
export const needsCsvEscape = text => text.startsWith("'") || formula.test(text);

export function writeCsvTable(columns, rows, { stringify }) {
  const safeRows = rows.map(row => row.map(value => {
    const text = String(value ?? '');
    return needsCsvEscape(text) ? "'" + text : text;
  }));
  return stringify([columns, ...safeRows], { bom: true, record_delimiter: 'windows' });
}

export function writeExcelTable(sheetName, columns, rows, { utils, write }) {
  const workbook = utils.book_new();
  const sheet = utils.aoa_to_sheet([columns, ...rows]);
  sheet['!cols'] = columns.map(name => ({ wch: Math.max(16, name.length + 3) }));
  utils.book_append_sheet(workbook, sheet, sheetName);
  return write(workbook, { bookType: 'xlsx', type: 'array', compression: true });
}
