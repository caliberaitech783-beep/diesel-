import { esc } from './entry-shell.mjs';
import { entrySiteDirectory } from './entry-sites.mjs';
import { indentFormData, indentDueDate, requiredDate, formatIndentDate, formatIndentNumber } from './indent-details.mjs';
import { review, entryRole } from './review-masters.mjs';

export function indentLocationControl(actor,selectedSite='') {
  const siteOptions=entrySiteDirectory(actor).map(row=>`<option value="${esc(row.site)}"${row.site===selectedSite?' selected':''}${row.allowed?'':' disabled'}>${esc(row.name)}</option>`).join('');
  return `<label for="indent-site">Site / Location<select id="indent-site" name="site" form="indent-site-switch"><option value=""${selectedSite?'':' selected'}>Select a location</option>${siteOptions}</select><noscript><button type="submit" form="indent-site-switch">Change location</button></noscript></label>`;
}

export function indentSiteForm(actor,inForm=false) {
  const path=entryRole(actor)==='Site In-charge'?'/entries/new/E1':'/entries/type/E1';
  return `<form id="indent-site-switch" class="indent-site-switch" method="post" action="/workspace/role"${inForm?' hidden':''}><input type="hidden" name="role" value="${esc(actor.profile)}"><input type="hidden" name="returnTo" value="${path}"><input type="hidden" name="indentSite" value="1">
    ${inForm?'':indentLocationControl(actor,actor.site)}</form>`;
}

export function indentHeading(doc) {
  return `<div class="indent-heading"><span class="indent-heading-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16M2 21h15M7 6h5v5H7zM15 9h2l3 3v5a1.5 1.5 0 0 0 3 0V9l-3-3"/></svg></span>
    <div><h1>${doc.status==='Draft'?'Create diesel indent':'Diesel indent'}</h1><p>Raise a request for diesel purchase</p></div></div>`;
}

export function indentFields(actor,doc,meta,render) {
  const selectedSite=doc.rev?doc.site:doc.selectedSite??'';
  const item=selectedSite?(doc.indentItem ?? meta.indentItem):null;
  const readOnly=(label,value)=>`<label>${label}<input type="text" readonly value="${esc(value??'Not set in Item Master')}"></label>`;
  const converted={...doc,data:indentFormData(doc)};
  const due=indentDueDate(converted);
  const take=(...keys)=>render(meta.fields.filter(field=>keys.includes(field.key)),converted);
  const extra=meta.fields.filter(field=>!['litres','unit','priority','requiredBy','reason','remarks'].includes(field.key));
  const requester=doc.requester??(doc.maker===actor.id?actor.employee:undefined);
  const requestedBy=requester?`${requester.name} · ${requester.empId}`:doc.requestedBy??(doc.maker===actor.id?actor.requestedBy:undefined)??'Employee details unavailable';
  return `<fieldset class="indent-card"><legend>Request details</legend><div class="indent-details-grid">
    <label>Indent number<input type="text" readonly value="${esc(formatIndentNumber(doc.number)||'')}" placeholder="Generated after saving"></label>
    <label>Indent date<input name="day" type="date" data-required="true" max="${esc(actor.businessDay??doc.day)}" value="${esc(doc.day)}"></label>
    ${indentLocationControl(actor,selectedSite)}</div><div class="indent-requester"><span>Requested by</span><strong>${esc(requestedBy)}</strong></div></fieldset>
    <fieldset class="indent-card"><legend>Fuel item</legend><div class="indent-item-grid">
      ${readOnly('Item name',selectedSite?(item?.name??review.item):'Select a location first')}
    </div></fieldset>
    <fieldset class="indent-card"><legend>Quantity &amp; delivery</legend><div class="indent-delivery-grid">
      ${take('litres')}<label>Sanction quantity<input type="text" readonly value="${esc(doc.approval?.sanctioned??'')}" placeholder="Filled by the approver"></label><label>Unit<input name="unit" type="text" readonly value="Litre"></label>
      ${take('priority')}${take('requiredBy')}<label>Required date<span class="indent-date-picker"><output data-indent-due aria-live="polite">${formatIndentDate(due)||'DD/MM/YYYY'}</output><input type="date" required data-indent-date aria-label="Required date" min="${esc(doc.day)}" max="${requiredDate(doc.day,3650)}" value="${due}"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg></span></label>
    </div></fieldset>
    <fieldset class="indent-card"><legend>Reason &amp; remarks</legend><div class="indent-reason-grid">${take('reason')}
      <label>Remarks<textarea name="remarks" rows="2" maxlength="2000" placeholder="Enter additional remarks (optional)" aria-describedby="indent-remarks-count">${esc(doc.data.remarks??'')}</textarea><span id="indent-remarks-count" class="indent-character-count">${String(doc.data.remarks??'').length} / 2000</span></label>
    </div>${extra.length?`<div class="indent-extra">${render(extra,converted)}</div>`:''}</fieldset>`;
}

export function indentReadDetails(doc,meta,actor) {
  const item=doc.indentItem??meta.indentItem;
  return [['Location',doc.site],['Indent number',formatIndentNumber(doc.number)],['Date',doc.day],
    ['Requested by',doc.requester?`${doc.requester.name} · ${doc.requester.empId}`:doc.requestedBy??'Employee details unavailable'],
    ['Item name',item?.name??doc.result.item??review.item],['Sanction quantity',doc.approval?.sanctioned!=null?doc.approval.sanctioned+' litres':'— (filled by the approver)'],
    ['Required date',formatIndentDate(indentDueDate(doc))]]
    .map(([label,value])=>`<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');
}
