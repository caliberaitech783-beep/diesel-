import { byId } from './catalog.mjs';
import { validDate } from './entry-rules.mjs';
import { utils, write } from 'xlsx';
import { indentStatus, formatIndentNumber } from './indent-details.mjs';

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

export function filterRegister(rows, type, filters, sources=rows) {
  const trace = traceEntries(sources), q = filters.q.toLowerCase();
  return rows.filter(row => {
    if ((type && row.type !== type) || (filters.status && (filters.status==='Saved'?indentStatus(row):row.status) !== filters.status)
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

export function entryExportRows(rows,sources=rows) {
  const trace = traceEntries(sources);
  return [['Document','Entry','Site','Business date','Shift','Truck','Vehicle','Status','Details','Results'],
    ...rows.map(row => {
      const { truck, vehicle } = trace(row);
      return [formatIndentNumber(row.number),byId[row.type].name,row.site,row.day,row.shift?.name,truck,vehicle,row.status,
        JSON.stringify(row.data),formatIndentNumber(JSON.stringify(row.result))];
    })];
}

export function entryCsvRows(rows) {
  return [['Document','Entry','Site','Date','Status','Details','Results'],
    ...rows.map(row=>[formatIndentNumber(row.number),byId[row.type].name,row.site,row.day,row.status,JSON.stringify(row.data),formatIndentNumber(JSON.stringify(row.result))])];
}

export function entryExcel(rows) {
  const workbook = utils.book_new();
  const sheet = utils.aoa_to_sheet(rows.map(row => row.map(value => String(value ?? '').slice(0,32767))));
  utils.book_append_sheet(workbook,sheet,'Diesel Entries');
  return write(workbook,{bookType:'xlsx',type:'buffer',compression:true});
}
