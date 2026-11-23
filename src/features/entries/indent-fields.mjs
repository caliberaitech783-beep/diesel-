import { esc } from './entry-shell.mjs';
import { entrySiteDirectory } from './entry-sites.mjs';
import { requiredDays } from './indent-details.mjs';
import { review, entryRole } from './review-masters.mjs';

export function indentSiteForm(actor) {
  const siteOptions=entrySiteDirectory(actor).map(row=>`<option value="${esc(row.site)}"${row.site===actor.site?' selected':''}${row.allowed?'':' disabled'}>${esc(row.name)}</option>`).join('');
  const path=entryRole(actor)==='Site In-charge'?'/entries/new/E1':'/entries/type/E1';
  return `<form id="indent-site-switch" class="indent-site-switch" method="post" action="/workspace/role"><input type="hidden" name="role" value="${esc(actor.profile)}"><input type="hidden" name="returnTo" value="${path}">
    <label for="indent-site">Location</label><select id="indent-site" name="site" form="indent-site-switch">${siteOptions}</select><noscript><button>Go</button></noscript></form>`;
}

export function indentFields(actor,doc,meta,render) {
  const item=doc.indentItem ?? meta.indentItem;
  const readOnly=(label,value)=>`<label>${label}<input type="text" readonly value="${esc(value??'Not set in Item Master')}"></label>`;
  const converted={...doc,data:{unit:'Litre',priority:'Normal',...doc.data,requiredBy:requiredDays(doc.data.requiredBy,doc.day)}};
  return `<div class="fields indent-fields">
    ${readOnly('Indent number',doc.number||'Generated when a new entry opens')}
    <label>Date<input name="day" type="date" data-required="true" max="${esc(actor.businessDay??doc.day)}" value="${esc(doc.day)}"></label>
    ${readOnly('Item name',item?.name??review.item)}${readOnly('HSN code',item?.hsn)}
    ${render(meta.fields,converted)}</div><div class="indent-notes"><span>Required date: <output data-indent-due aria-live="polite"></output></span>
    </div>`;
}

export function indentReadDetails(doc,meta,actor) {
  const item=doc.indentItem??meta.indentItem;
  return [['Location',doc.site],['Indent number',doc.number],['Date',doc.day],['Item name',item?.name??doc.result.item??review.item],
    ['HSN code',item?.hsn??'—']]
    .map(([label,value])=>`<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');
}
