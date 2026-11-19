import { byId } from './catalog.mjs';
import { validDate } from './entry-rules.mjs';

const text = value => typeof value === 'string' ? value.trim().slice(0, 100) : '';
const date = value => validDate(value) ? value : '';

export function registerFilters(query) {
  return { q: text(query.q), status: text(query.status), from: date(query.from), to: date(query.to),
    truck: text(query.truck), vehicle: text(query.vehicle) };
}

export function traceEntries(rows) {
  const documents = new Map(rows.map(row => [row.id, row]));
  return row => {
    const gate = documents.get(row.data.gate) ?? documents.get(documents.get(row.data.grn)?.data.gate);
    return { truck: row.data.truck ?? gate?.data.truck, vehicle: row.data.vehicle };
  };
}

export function filterRegister(rows, type, filters) {
  const trace = traceEntries(rows), q = filters.q.toLowerCase();
  return rows.filter(row => {
    if ((type && row.type !== type) || (filters.status && row.status !== filters.status)
      || (filters.from && row.day < filters.from) || (filters.to && row.day > filters.to)) return false;
    const { truck, vehicle } = trace(row);
    if ((filters.truck && filters.truck.toLowerCase() !== truck?.toLowerCase())
      || (filters.vehicle && filters.vehicle.toLowerCase() !== vehicle?.toLowerCase())) return false;
    return !q || [row.number, row.type, byId[row.type].name, truck, vehicle,
      ...Object.values(row.data).filter(value => typeof value === 'string')].join(' ').toLowerCase().includes(q);
  });
}

export function entryCsv(rows) {
  const cell = value => '"' + String(value ?? '').replace(/^([\s]*[=+@\-]|[\t\r\n])/, "'$1").replaceAll('"', '""') + '"';
  return '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
