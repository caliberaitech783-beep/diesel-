// The Goods Receipt Note (E7) form: gate entry and goods receipt in one page.
import { entryDayMin } from './entry-rules.mjs';
import { sourceChoices } from './entry-choices.mjs';
import { formatIndentNumber } from './indent-details.mjs';
import { canonicalSite } from '../pulse-masters/site-names.mjs';
import { entrySites } from './entry-sites.mjs';
import storageLocations from '../company-records/storage-location-master-data.mjs';
import { review } from './review-masters.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const star = ' <b class="req" aria-hidden="true">*</b>';
const icon = path => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
const icons = {
  truck: icon('<path d="M3 7h10v9H3zM13 11h4l4 3v2h-8zM7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>'),
  party: icon('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/>'),
  doc: icon('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5"/>'),
  layers: icon('<path d="m12 2 9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 17l9 5 9-5"/>'),
  check: icon('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="m8 12 3 3 5-6"/>'),
  clip: icon('<path d="m21 12-8.5 8.5a5 5 0 0 1-7-7L14 5a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 8"/>'),
};

// Storage locations of the site, from the Storage Location Master; every storage when the site has none listed.
export function grnStorages(site) {
  const key = canonicalSite(entrySites.find(row => row.site === site)?.name ?? site);
  const active = storageLocations.filter(row => row.Status !== 'Inactive' && row['Storage Loc Code']);
  const here = active.filter(row => canonicalSite(row.Location) === key);
  return (here.length ? here : active).map(row => ({ code: String(row['Storage Loc Code']), name: String(row['Storage Loc. Name'] ?? '') }));
}

export function grnHeading() {
  return `<div class="order-heading"><span class="order-heading-icon" aria-hidden="true">${icons.truck}</span>
    <div><h1>GRN</h1><p>Gate Entry + GRN (Merged)</p></div></div>`;
}

const rowsOf = value => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) { try { const rows = JSON.parse(value); return Array.isArray(rows) ? rows : []; } catch { return []; } }
  return [];
};

export function grnFields(actor, doc, meta, rows) {
  const d = doc.data, field = key => meta.fields.find(f => f.key === key);
  const card = (name, title, body, symbol) => `<fieldset class="order-card grn-${name}"><legend>${icons[symbol] ?? ''}<span>${title}</span></legend>${body}</fieldset>`;
  const select = (key, label, placeholder, { required = false, choices } = {}) => {
    const value = d[key] ?? field(key).default ?? '', options = choices ?? field(key).options.map(option => [option, option]);
    return `<label><span>${esc(label)}${required ? star : ''}</span><select name="${key}"${required ? ' data-required="true"' : ''}><option value=""${value ? '' : ' selected'}>${esc(placeholder)}</option>${
      options.map(([v, n]) => `<option value="${esc(v)}"${v === value ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>`;
  };
  const input = (key, label, placeholder, { required = false, type = 'text', attrs = '' } = {}) =>
    `<label><span>${esc(label)}${required ? star : ''}</span><input name="${key}" type="${type}"${required ? ' data-required="true"' : ''}${type === 'number' ? ' min="0" step="0.01" inputmode="decimal"' : ''} ${attrs} placeholder="${esc(placeholder)}" value="${esc(d[key] ?? '')}"></label>`;
  const linked = key => sourceChoices(field(key), doc, rows, actor).map(row => [row.id, formatIndentNumber(row.number) + (row.data.supplier ? ' · ' + row.data.supplier : '')]);
  const file = (key, label) => {
    const saved = Array.isArray(d[key]) ? d[key] : [];
    return `<label class="grn-upload"><span>${esc(label)}${star}</span><input type="file" name="${key}" accept="image/png,image/jpeg,application/pdf" multiple data-saved="${esc(JSON.stringify(saved))}">
      <small>${saved.length ? esc(saved.map(item => item.name).join(', ')) : 'PDF, JPG, PNG · up to 5 MB each'}</small></label>`;
  };
  const storages = grnStorages(doc.site);
  const materials = rowsOf(d.materials), allocations = rowsOf(d.storage);
  const materialRow = (row = {}) => `<tr><td class="num"></td>
      <td><select data-col="material"><option${row.material && row.material !== review.item ? '' : ' selected'}>${esc(review.item)}</option>${row.material && row.material !== review.item ? `<option selected>${esc(row.material)}</option>` : ''}</select></td>
      <td><input data-col="invoiceQty" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Enter Quantity" value="${esc(row.invoiceQty ?? '')}"></td>
      <td><input data-col="receivedQty" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Enter Quantity" value="${esc(row.receivedQty ?? '')}"></td>
      <td><output data-col="discrepancy"></output></td>
      <td><input data-col="rate" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Enter Rate" value="${esc(row.rate ?? '')}"></td>
      <td><output data-col="amount"></output></td><td><button type="button" class="grn-remove" data-remove-row aria-label="Delete row">✕</button></td></tr>`;
  const storageRow = (row = {}) => `<tr><td class="num"></td>
      <td><select data-col="storage"><option value="">Select Storage Location</option>${storages.map(place =>
        `<option value="${esc(place.code)}"${place.code === row.storage ? ' selected' : ''}>${esc(place.code + (place.name && place.name !== place.code ? ' · ' + place.name : ''))}</option>`).join('')}${
        row.storage && !storages.some(place => place.code === row.storage) ? `<option selected>${esc(row.storage)}</option>` : ''}</select></td>
      <td><input data-col="litres" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Enter Quantity" value="${esc(row.litres ?? '')}"></td>
      <td><button type="button" class="grn-remove" data-remove-row aria-label="Delete row">✕</button></td></tr>`;

  return `<div class="order-grid four grn-top">
      <label><span>Site Location${star}</span><input type="text" readonly tabindex="-1" value="${esc(entrySites.find(row => row.site === doc.site)?.name ?? doc.site)}"></label>
      ${select('docType', 'Doc Type', 'Select Doc Type', { required: true })}
      <label><span>GRN Date${star}</span><input name="day" type="date" data-required="true" min="${esc(entryDayMin(actor.businessDay ?? doc.day, doc))}" max="${esc(actor.businessDay ?? doc.day)}" value="${esc(doc.day)}"></label>
      <label><span>GRN No.</span><input type="text" readonly tabindex="-1" placeholder="Generated on save" value="${esc(doc.number ?? '')}"></label>
    </div>
    <div class="order-grid two grn-pair">
    ${card('party', 'Party Details', `<div class="order-grid three">${select('supplier', 'Party / Vendor Name', 'Select Vendor', { required: true })}
      ${select('po', 'PO No.', 'Select PO', { choices: linked('po') })}${select('ds', 'DS No.', 'Select DS', { choices: linked('ds') })}</div>`, 'party')}
    ${card('reference', 'Reference Document', `<div class="order-grid three">${select('refDocType', 'Ref Doc Type', 'Select Type')}
      ${input('refDocNo', 'Ref Doc No.', 'Enter Reference No.', { attrs: 'maxlength="100" autocomplete="off"' })}${input('refDocDate', 'Ref Doc Date', '', { type: 'date' })}</div>`, 'doc')}
    </div>
    ${card('transport', 'Transport &amp; Vehicle Details', `<div class="order-grid four">${select('transporter', 'Transporter', 'Select Transporter', { required: true })}
      ${input('vehicleNo', 'Vehicle No.', 'Enter Vehicle No.', { required: true, attrs: 'maxlength="13" autocomplete="off" autocapitalize="characters"' })}
      ${select('vehicleType', 'Vehicle Type', 'Select Vehicle Type', { required: true })}${input('lrNo', 'LR No.', 'Enter LR No.', { attrs: 'maxlength="100" autocomplete="off"' })}
      ${input('lrDate', 'LR Date', '', { type: 'date' })}${select('freightType', 'Freight Type', 'Select Type')}
      ${input('freightContract', 'Freight Contract', 'Enter Contract', { attrs: 'maxlength="100" autocomplete="off"' })}${input('freightRate', 'Freight Rate', 'Enter Rate', { type: 'number' })}</div>`, 'truck')}
    ${card('material', 'Material Details', `<div class="order-table"><table data-grn-rows="materials"><thead><tr><th>#</th><th>Material Name${star}</th><th>Diesel Invoice Qty (L)${star}</th>
      <th>Diesel Received Qty (L)${star}</th><th>Discrepancy Type</th><th>Diesel Rate (₹/L)${star}</th><th>Amount (₹)</th><th></th></tr></thead>
      <tbody>${(materials.length ? materials : [{}]).map(materialRow).join('')}</tbody></table><template>${materialRow()}</template></div>
      <div class="order-schedule-foot"><button type="button" data-add-row="materials">+ Add Material</button>
        <output class="grn-total">Total Qty (L): <b data-grn="totalQty">0.00</b> &nbsp; Total Amount (₹): <b data-grn="totalAmount">0.00</b></output></div>
      <input type="hidden" name="materials" value="${esc(JSON.stringify(materials))}">`, 'layers')}
    <div class="order-grid two grn-pair">
    ${card('storage', 'Storage Allocation', `<div class="order-table"><table data-grn-rows="storage"><thead><tr><th>#</th><th>Storage Location${star}</th><th>Diesel Qty (L)${star}</th><th></th></tr></thead>
      <tbody>${(allocations.length ? allocations : [{}]).map(storageRow).join('')}</tbody></table><template>${storageRow()}</template></div>
      <div class="order-schedule-foot"><button type="button" data-add-row="storage">+ Add Allocation</button><output class="grn-total">Allocated Qty (L): <b data-grn="allocatedQty">0.00</b></output></div>
      <input type="hidden" name="storage" value="${esc(JSON.stringify(allocations))}">`, 'doc')}
    ${card('inspection', 'Diesel Inspection', `<div class="order-grid two">${input('inspectionNo', 'Inspection No.', 'Enter Inspection No.', { attrs: 'maxlength="100" autocomplete="off"' })}
      ${input('inspectionDate', 'Inspection Date', '', { type: 'date' })}${input('acceptedQty', 'Accepted Qty (L)', 'Enter Quantity', { required: true, type: 'number' })}
      ${input('inspector', 'Inspector', 'Enter inspector name', { required: true, attrs: 'maxlength="200" autocomplete="off"' })}</div>`, 'check')}
    </div>
    ${card('attachments', 'Attachments', `<div class="order-grid two">${file('unloadingSlip', 'Unloading Slip')}${file('invoiceFile', 'Invoice')}</div>`, 'clip')}`;
}
