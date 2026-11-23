import { esc } from './entry-shell.mjs';
import { entrySiteDirectory } from './entry-sites.mjs';
import { requiredDays, formatIndentNumber } from './indent-details.mjs';
import { review, entryRole } from './review-masters.mjs';

export function indentLocationControl(actor) {
  const siteOptions=entrySiteDirectory(actor).map(row=>`<option value="${esc(row.site)}"${row.site===actor.site?' selected':''}${row.allowed?'':' disabled'}>${esc(row.name)}</option>`).join('');
  return `<label for="indent-site">Site / Location<select id="indent-site" name="site" form="indent-site-switch">${siteOptions}</select><noscript><button type="submit" form="indent-site-switch">Change location</button></noscript></label>`;
}

export function indentSiteForm(actor,inForm=false) {
  const path=entryRole(actor)==='Site In-charge'?'/entries/new/E1':'/entries/type/E1';
  return `<form id="indent-site-switch" class="indent-site-switch" method="post" action="/workspace/role"${inForm?' hidden':''}><input type="hidden" name="role" value="${esc(actor.profile)}"><input type="hidden" name="returnTo" value="${path}">
    ${inForm?'':indentLocationControl(actor)}</form>`;
}

export function indentHeading(doc) {
  return `<div class="indent-heading"><span class="indent-heading-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16M2 21h15M7 6h5v5H7zM15 9h2l3 3v5a1.5 1.5 0 0 0 3 0V9l-3-3"/></svg></span>
    <div><h1>${doc.status==='Draft'?'Create diesel indent':'Diesel indent'}</h1><p>Raise a request for diesel purchase</p></div></div>`;
}

export function indentFields(actor,doc,meta,render) {
  const item=doc.indentItem ?? meta.indentItem;
  const readOnly=(label,value)=>`<label>${label}<input type="text" readonly value="${esc(value??'Not set in Item Master')}"></label>`;
  const converted={...doc,data:{unit:'Litre',priority:'Normal',...doc.data,requiredBy:requiredDays(doc.data.requiredBy,doc.day)}};
  const take=(...keys)=>render(meta.fields.filter(field=>keys.includes(field.key)),converted);
  const extra=meta.fields.filter(field=>!['litres','unit','priority','requiredBy','reason','remarks'].includes(field.key));
  const requestedBy=doc.requestedBy??(doc.maker===actor.id?actor.requestedBy:undefined)??(actor.hosted?doc.maker:'Local workspace');
  return `<fieldset class="indent-card"><legend>Request details</legend><div class="indent-details-grid">
    ${readOnly('Indent number',formatIndentNumber(doc.number)||'Generated when a new entry opens')}
    <label>Indent date<input name="day" type="date" data-required="true" max="${esc(actor.businessDay??doc.day)}" value="${esc(doc.day)}"></label>
    ${indentLocationControl(actor)}</div><div class="indent-requester"><span>Requested by</span><strong>${esc(requestedBy)}</strong></div></fieldset>
    <fieldset class="indent-card"><legend>Fuel item</legend><div class="indent-item-grid">
      ${readOnly('Item name',item?.name??review.item)}${readOnly('HSN code',item?.hsn)}
    </div></fieldset>
    <fieldset class="indent-card"><legend>Quantity &amp; delivery</legend><div class="indent-delivery-grid">
      <div class="indent-quantity-block"><div class="indent-quantity-controls">${take('litres','unit')}</div>
        <div class="indent-priority">${take('priority')}</div></div>
      <div class="indent-date-controls">${take('requiredBy')}<label>Required date<output data-indent-due aria-live="polite"></output></label></div>
    </div></fieldset>
    <fieldset class="indent-card"><legend>Reason &amp; remarks</legend><div class="indent-reason-grid">${take('reason')}
      <label>Remarks<textarea name="remarks" rows="2" maxlength="2000" placeholder="Enter additional remarks (optional)" aria-describedby="indent-remarks-count">${esc(doc.data.remarks??'')}</textarea><span id="indent-remarks-count" class="indent-character-count">${String(doc.data.remarks??'').length} / 2000</span></label>
    </div>${extra.length?`<div class="indent-extra">${render(extra,converted)}</div>`:''}</fieldset>`;
}

export function indentReadDetails(doc,meta,actor) {
  const item=doc.indentItem??meta.indentItem;
  return [['Location',doc.site],['Indent number',formatIndentNumber(doc.number)],['Date',doc.day],['Item name',item?.name??doc.result.item??review.item],
    ['HSN code',item?.hsn??'—']]
    .map(([label,value])=>`<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');
}
