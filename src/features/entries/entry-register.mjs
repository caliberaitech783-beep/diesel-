import { byId } from './catalog.mjs';
import { letterheadRows } from './letterhead.mjs';
import { validDate } from './entry-rules.mjs';
import { utils, write } from 'xlsx';
import { indentStatus, formatIndentNumber } from './indent-details.mjs';
import { footerRowsOf, purchaseOrderTotals, rupeesInWords } from './assets/purchase-order-totals.js';
import { review } from './review-masters.mjs';
import { locationName } from './site-locations.mjs';

const text = value => typeof value === 'string' ? value.trim().slice(0, 100) : '';
const date = value => validDate(value) ? value : '';

export const isRegisterRecord = row => row.type!=='E1' || indentStatus(row)==='Saved';

// "Waiting" gathers everything that waits on someone: an indent saved for sanction, an entry awaiting approval, a
// payment awaiting Treasury.
export const waiting = 'Waiting', waitingStates = ['Awaiting approval', 'Saved', 'Awaiting Treasury'];

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
    if (!isRegisterRecord(row)) return false;
    if ((type && row.type !== type) || (filters.status && (filters.status===waiting ? !waitingStates.includes(row.status) : (filters.status==='Saved'?indentStatus(row):row.status) !== filters.status))
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

// The time an entry was first saved, as two cells: 27-Nov-2026 and 04:40 PM, in IST.
const istPart = (stamp, options) => stamp ? new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', ...options }).format(new Date(stamp)) : '';
export const createdCells = row => [istPart(row.created, { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-'),
  istPart(row.created, { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase(), row.createdBy ?? ''];

// One form field as a cell: a linked document by its number, attachments by name, a table of rows as readable text.
function fieldCell(field, value, numberOf) {
  if (value === undefined || value === null || value === '') return '';
  if (field.type === 'link') return numberOf(value) || '';
  if (field.type === 'file' || field.type === 'photo') return Array.isArray(value) ? value.map(file => file?.name ?? '').filter(Boolean).join(', ') : '';
  if (field.type === 'rows') {
    let rows = value;
    if (typeof rows === 'string') { try { rows = JSON.parse(rows); } catch { return rows; } }
    if (!Array.isArray(rows)) return '';
    const label = key => field.columns?.find(column => column.key === key)?.label ?? key;
    return rows.map((row, index) => (index + 1) + ') ' + Object.entries(row).filter(([, cell]) => cell !== '' && cell !== undefined && cell !== null)
      .map(([key, cell]) => label(key) + ': ' + cell).join(', ')).join(' | ');
  }
  return typeof value === 'object' ? '' : value;
}

// A download holds what was entered on the form and when the entry was made, and nothing worked out afterwards:
// no calculated results, approvals or site stock. Status stays, so a draft is not mistaken for a posted entry.
// - entries of one kind: one column for each field of that form;
// - a mix of kinds: the form's details together in one readable column.
export function entryExportRows(rows, sources = rows) {
  const numberOf = id => formatIndentNumber(sources.find(row => row.id === id)?.number ?? '');
  const kinds = new Set(rows.map(row => row.type));
  if (kinds.size === 1) {
    const fields = byId[rows[0].type].fields;
    // The indent form also shows the sanction quantity its approver filled in.
    const extra = rows[0].type === 'E1' ? [['Sanction quantity', row => row.result?.sanctioned ?? '']] : [];
    return [['Document', 'Date', 'Status', 'Site', ...fields.map(field => field.label), ...extra.map(([label]) => label), 'Creation Date', 'Creation Time', 'Created By'],
      ...rows.map(row => [formatIndentNumber(row.number), row.day, row.status, row.site, ...fields.map(field => fieldCell(field, row.data?.[field.key], numberOf)),
        ...extra.map(([, value]) => value(row)), ...createdCells(row)])];
  }
  return [['Document', 'Entry', 'Site', 'Date', 'Status', 'Details', 'Creation Date', 'Creation Time', 'Created By'],
    ...rows.map(row => [formatIndentNumber(row.number), byId[row.type].name, row.site, row.day, row.status,
      byId[row.type].fields.map(field => [field.label, fieldCell(field, row.data?.[field.key], numberOf)]).filter(([, cell]) => cell !== '').map(([label, cell]) => label + ': ' + cell).join('; '),
      ...createdCells(row)])];
}

// A purchase order download has one column for every field on the form, its totals and its record information.
const ist = (value, options) => value ? new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', ...options }).format(new Date(value)) : '';
const freightTypes = { Delivered: 'FOR', 'Ex-depot': 'To Pay' };
const footerSlots = 5;
export function purchaseOrderExportRows(rows, sources = rows) {
  const numberOf = id => formatIndentNumber(sources.find(row => row.id === id)?.number ?? '');
  const head = ['PO No.', 'PO Date', 'Status', 'Location', 'Site', 'Delivery Date', 'Indent No.', 'Undersigned (Employee)', 'Party / Vendor Name', 'Transaction Type', 'Supply Nature', 'PO Type',
    'Lifting Location', 'Freight Type', 'Freight Contract No.', 'Freight Rate (₹/L)', 'Landing on Gross', 'Material', 'Diesel Qty (L)', 'Net Rate', 'Amount',
    ...Array.from({ length: footerSlots }, (_, index) => ['Footer Head ', 'Legend ', 'Rate / % ', 'Calculated On ', 'Value (₹) '].map(label => label + (index + 1))).flat(),
    'Total (Before Footer Heads)', 'Total Footer Heads', 'P.O. Amount', 'Landed Rate (per Litre)', 'PO Amount in Words', 'Tolerance (%)', 'Shortage Deduction From', 'Shortage Deduction Method',
    'Freight Deduction Rate', 'Is Full Payment as Advance?', 'Advance Amount (₹)', 'Payment Advice Location', 'Payment Advice No.', 'Creation Date', 'Creation Time', 'Created By'];
  return [head, ...rows.map(row => {
    const d = row.data ?? {}, totals = purchaseOrderTotals(d);
    const footer = Array.from({ length: footerSlots }, (_, index) => {
      const entered = footerRowsOf(d)[index], worked = totals.rows[index];
      return entered?.head ? [entered.head, entered.legend, entered.rate ?? '', worked?.on ?? '', worked?.value ?? ''] : ['', '', '', '', ''];
    }).flat();
    return [formatIndentNumber(row.number), row.day, row.status, locationName(row.site), row.site, d.deliveryDate, numberOf(d.indent), d.undersigned, d.supplier, d.transactionType, d.supplyNature, d.type,
      d.depot, freightTypes[d.basis] ?? d.basis, d.freightContract, d.freightRate, d.loadingOnGross, review.item, d.litres ?? (d.kl ? d.kl * 1000 : ''), totals.netRate || '', totals.amount || '',
      ...footer, totals.amount, totals.footer, totals.total, totals.landedRate, rupeesInWords(totals.total), d.tolerance, d.shortageFrom, d.shortageMethod,
      d.freightDeductionRate, d.terms === 'Advance' ? 'Yes' : d.terms === 'Credit' ? 'No' : '', d.advanceAmount, d.paymentAdviceLocation, d.paymentAdviceNo,
      ist(row.created, { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-'), ist(row.created, { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase(), row.createdBy ?? ''];
  })];
}
// A register filtered to purchase orders downloads in that fuller layout.
export const purchaseOrdersOnly = rows => rows.length > 0 && rows.every(row => row.type === 'E2');

// CSV and Excel carry the same columns.
export const entryCsvRows = entryExportRows;

export function entryExcel(rows) {
  const workbook = utils.book_new();
  // The company letterhead tops the sheet; the column headings follow a blank row.
  const top = letterheadRows(), across = Math.max(1, ...rows.map(row => row.length)) - 1;
  const sheet = utils.aoa_to_sheet([...top, ...rows.map(row => row.map(value => String(value ?? '').slice(0,32767)))]);
  sheet['!merges'] = top.slice(0, -1).map((_, r) => ({ s: { r, c: 0 }, e: { r, c: across } }));
  utils.book_append_sheet(workbook,sheet,'Diesel Entries');
  return write(workbook,{bookType:'xlsx',type:'buffer',compression:true});
}
