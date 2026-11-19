import { page, esc, option } from './entry-shell.mjs';
import { entryRole } from './review-masters.mjs';

const path = '/entries/opening-stock';

export function openingStockSetupPage(actor) {
  return page('Opening stock',actor,'opening-stock',path,`<section>
    <p>Site stock is awaiting setup. Measured balances can be saved after Diesel receives verified Pulse site assignments and an approved master data source.</p>
    <p>The Site In-charge records measured litres for every tank and bowser. The Project Manager approves the snapshot before entries use it.</p>
    <a href="/entries">Open the review register</a></section>`);
}

export function openingStockPage(actor, masters, record, error, draft) {
  const canSubmit = entryRole(actor)==='Site In-charge' && record?.status!=='approved';
  const canReview = entryRole(actor)==='Project Manager' && record?.status==='pending' && record.maker!==actor.id;
  const edit = canSubmit && masters.items.length && masters.storage.length;
  const state = record?.status==='approved'?'Approved':record?'Waiting for Project Manager':'Awaiting readings';
  const reading = code => (draft?.readings?.find(row=>row.code===code)?.litres
    ?? record?.storage.find(row=>row.code===code)?.opening) ?? '';
  const item = draft?.item ?? record?.item.code;
  const time = draft?.measuredAt ?? record?.measuredAt ?? '';
  const form = edit ? `<form method="post" action="${path}">
    <input type="hidden" name="revision" value="${record?.revision??0}">
    <div class="fields">
      <label>Approved diesel item<select name="item" required>${option('','Choose an item',!item)}
        ${masters.items.map(row=>option(row.code,row.code+' · '+row.name,row.code===item)).join('')}</select></label>
      <label>Stock measured as of (IST)<input type="datetime-local" name="measuredAt" value="${esc(time)}" required></label>
      <label>Accounts-approved opening rate (₹/KL)<input type="number" name="openingRate" min="0.0001" step="0.0001" value="${esc(draft?.openingRate??record?.openingRate)}"></label>
    </div>
    <div class="scroll"><table><thead><tr><th>Storage</th><th>Type</th><th>Safe fill (L)</th><th>Measured litres</th></tr></thead>
      <tbody>${masters.storage.map(row=>`<tr><td>${esc(row.code)} · ${esc(row.name)}<input type="hidden" name="code" value="${esc(row.code)}"></td>
      <td>${esc(row.type)}</td><td>${esc(row.safe)}</td><td><input type="number" name="litres" aria-label="Opening litres for ${esc(row.code)}" step="0.0001" min="0" max="${row.safe}" value="${esc(reading(row.code))}" required></td></tr>`).join('')}</tbody></table></div>
    <button class="primary">Save for review</button></form>` : '';
  const saved = record && !edit ? `<p>${esc(record.item.code)} · ${esc(record.item.name)} · ${esc(record.measuredAt.replace('T',' '))} IST</p>
    ${record.openingRate?`<p>Opening rate · ₹${esc(record.openingRate)}/KL</p>`:''}
    <div class="scroll"><table><thead><tr><th>Storage</th><th>Opening litres</th></tr></thead>
    <tbody>${record.storage.map(row=>`<tr><td>${esc(row.code)} · ${esc(row.name)}</td><td>${esc(row.opening)}</td></tr>`).join('')}</tbody></table></div>` : '';
  const prerequisite = !record && (!masters.items.length || !masters.storage.length)
    ? '<p>Approve an Item Master record and the site’s tanks and bowsers in Storage Location Master to enter opening stock.</p>' : '';
  const valuation = record?.status==='approved'&&!record.openingRate ? `
    ${record.rateProposal?`<p>Opening rate awaiting approval · ₹${esc(record.rateProposal.rate)}/KL</p>`:'<p>The opening rate is needed for transfers, weighted recovery and month-end valuation.</p>'}
    ${entryRole(actor)==='Site In-charge'?`<form method="post" action="${path}/valuation"><input type="hidden" name="revision" value="${record.revision}">
      <label>Accounts-approved opening rate (₹/KL)<input type="number" name="openingRate" min="0.0001" step="0.0001" value="${esc(draft?.openingRate??record.rateProposal?.rate)}" required></label>
      <button class="primary">Save opening rate for review</button></form>`:''}
    ${entryRole(actor)==='Project Manager'&&record.rateProposal&&record.rateProposal.maker!==actor.id?
      `<form method="post" action="${path}/valuation/approve"><input type="hidden" name="revision" value="${record.revision}"><button class="primary">Approve opening rate</button></form>`:''}` : '';
  return page('Opening stock',actor,'opening-stock',path,`
    <section><p><strong>${state}</strong></p>${error?`<p role="alert">${esc(error)}</p>`:''}
    ${prerequisite}${form}${saved}${valuation}
    ${canReview?`<form method="post" action="${path}/approve"><input type="hidden" name="revision" value="${record.revision}"><button class="primary">Approve opening stock</button></form>`:''}
    ${record?.status==='approved'?'<p><a href="/entries">Open the entry register</a></p>':''}</section>`);
}
