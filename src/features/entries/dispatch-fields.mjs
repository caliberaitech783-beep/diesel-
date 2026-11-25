// The Delivery Schedule (E4) form: one card of dispatch details against an approved purchase order.
import { sourceChoices } from './entry-choices.mjs';
import { formatIndentNumber } from './indent-details.mjs';
import storageLocations from '../company-records/storage-location-master-data.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const star = ' <b class="req" aria-hidden="true">*</b>';
const icon = path => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
const truck = icon('<path d="M3 7h10v9H3zM13 11h4l4 3v2h-8zM7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>');

// The company's own tank trucks and bowsers, from the Storage Location Master. Any other vehicle number can be typed.
export const dispatchVehicles = [...new Set(storageLocations.filter(row => row.Status !== 'Inactive' && row['Bowser registration No.'])
  .map(row => String(row['Bowser registration No.']).trim().toUpperCase()))].sort();

export function dispatchHeading(doc) {
  return `<div class="order-heading"><span class="order-heading-icon" aria-hidden="true">${truck}</span>
    <div><h1>Delivery Schedule</h1><p>${doc.rev ? 'Edit this Diesel Delivery Schedule' : 'Create a new Diesel Delivery Schedule'}</p></div></div>`;
}

export function dispatchFields(actor, doc, meta, rows) {
  const d = doc.data, field = key => meta.fields.find(f => f.key === key);
  const select = (key, label, choices, placeholder) => {
    const value = d[key] ?? field(key).default ?? '', only = !value && choices.length === 1 && key === 'item';
    return `<label><span>${esc(label)}${star}</span><select name="${key}" data-required="true"><option value=""${value || only ? '' : ' selected'}>${esc(placeholder)}</option>${
      choices.map(([v, n]) => `<option value="${esc(v)}"${v === value || only ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>`;
  };
  const orders = sourceChoices(field('po'), doc, rows, actor).map(row => [row.id, formatIndentNumber(row.number) + (row.data.supplier ? ' · ' + row.data.supplier : '')]);
  const plain = key => field(key).options.map(value => [value, value]);
  return `<fieldset class="order-card order-dispatch"><legend>${truck}<span>Dispatch Details</span></legend><div class="order-grid three">
      <label><span>Location${star}</span><input type="text" readonly tabindex="-1" value="${esc(doc.site)}"></label>
      <label><span>Date${star}</span><input name="day" type="date" data-required="true" max="${esc(actor.businessDay ?? doc.day)}" value="${esc(doc.day)}"></label>
      ${select('po', 'Purchase Order No.', orders, orders.length ? 'Select purchase order' : 'No approved purchase order with a balance')}
      <label>Delivery Schedule No.<input type="text" readonly tabindex="-1" placeholder="Generated on save" value="${esc(doc.number ?? '')}"></label>
      <label><span>Delivery Date${star}</span><input name="deliveryDate" type="date" data-required="true" min="${esc(doc.day)}" value="${esc(d.deliveryDate ?? '')}"></label>
      ${select('deliveryLocation', 'Delivery Location', plain('deliveryLocation'), 'Select delivery location')}
      <label><span>Delivery Address${star}</span><input name="deliveryAddress" type="text" data-required="true" maxlength="300" autocomplete="off" placeholder="Enter delivery address" value="${esc(d.deliveryAddress ?? '')}"></label>
      ${select('item', 'Item Name', plain('item'), 'Select item')}
      <label><span>DSL Qty (L)${star}</span><input name="litres" type="number" data-required="true" min="0.01" step="0.01" inputmode="decimal" placeholder="Enter quantity" value="${esc(d.litres ?? '')}"></label>
      <label><span>Vehicle No.${star}</span><input name="vehicleNo" type="text" data-required="true" maxlength="13" autocomplete="off" autocapitalize="characters" list="dispatch-vehicles" placeholder="Select or type vehicle, e.g. MH34BZ4428" value="${esc(d.vehicleNo ?? '')}">
        <datalist id="dispatch-vehicles">${dispatchVehicles.map(number => `<option value="${esc(number)}">`).join('')}</datalist></label>
      ${select('transporter', 'Transporter', plain('transporter'), 'Select transporter')}
    </div></fieldset>`;
}

// A saved Delivery Schedule laid out like its form: the same card and the same order of fields, read rather than typed.
export function dispatchView(doc, orderLink) {
  const d = doc.data, r = doc.result ?? {};
  const date = value => /^\d{4}-\d{2}-\d{2}$/.test(value ?? '') ? value.split('-').reverse().join('-') : value;
  const litres = value => typeof value === 'number' ? value.toLocaleString('en-IN') : value;
  const shown = value => value === undefined || value === null || value === '' ? '—' : esc(value);
  const rows = [['Location', shown(doc.site)], ['Date', shown(date(doc.day))], ['Purchase Order No.', orderLink || shown(r.order)],
    ['Delivery Schedule No.', shown(formatIndentNumber(doc.number ?? ''))], ['Delivery Date', shown(date(d.deliveryDate))], ['Delivery Location', shown(d.deliveryLocation)],
    ['Delivery Address', shown(d.deliveryAddress)], ['Item Name', shown(d.item)], ['DSL Qty (L)', shown(litres(d.litres))],
    ['Vehicle No.', shown(r.vehicle ?? d.vehicleNo)], ['Transporter', shown(d.transporter)], ['Supplier', shown(r.supplier)],
    ...(r.balance === undefined ? [] : [['PO Balance after this schedule (L)', shown(litres(r.balance))]])];
  return `<div class="order-view"><section class="order-card order-view-card order-view-record order-dispatch"><h2>${truck}<span>Dispatch Details</span></h2><dl class="order-view-list">${
    rows.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${value}</dd></div>`).join('')}</dl></section></div>`;
}
