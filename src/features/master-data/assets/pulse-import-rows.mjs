// Turns the rows of a CSV or Excel sheet into records for a Pulse master. The first row names the columns,
// by the heading shown on the page or by its key, in any order and any letter case.
const plain = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function pulseImportRows(rows, columns) {
  const start = rows.findIndex(row => row.some(cell => String(cell ?? '').trim()));
  if (start < 0) throw new Error('The file has no records.');
  const names = new Map(columns.flatMap(([key, label]) => [[plain(key), key], [plain(label), key]]));
  const header = rows[start].map(cell => names.get(plain(cell)));
  if (!header.includes(columns[0][0])) throw new Error('The first row must name the columns and include "' + columns[0][1] + '".');
  return rows.slice(start + 1).map(row => Object.fromEntries(header.map((key, index) => [key, String(row[index] ?? '').trim()]).filter(([key]) => key)))
    .filter(record => Object.values(record).some(Boolean));
}
