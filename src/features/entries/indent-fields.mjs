import { esc } from './entry-shell.mjs';
import { entrySiteDirectory } from './entry-sites.mjs';
import { indentSeries, requiredDays } from './indent-details.mjs';
import { review } from './review-masters.mjs';

export function indentSiteForm(actor) {
  return `<form id="indent-site-switch" method="post" action="/workspace/role"><input type="hidden" name="role" value="${esc(actor.profile)}"><input type="hidden" name="returnTo" value="/entries/new/E1"></form>`;
}

export function indentFields(actor,doc,meta,render) {
  const item=doc.indentItem ?? meta.indentItem;
  const readOnly=(label,value)=>`<label>${label}<input type="text" readonly value="${esc(value??'Not set in Item Master')}"></label>`;
  const siteOptions=entrySiteDirectory(actor).map(row=>`<option value="${esc(row.site)}"${row.site===actor.site?' selected':''}${row.allowed?'':' disabled'}>${esc(row.name)}</option>`).join('');
  const converted={...doc,data:{...doc.data,requiredBy:requiredDays(doc.data.requiredBy,doc.day)}};
  return `<div class="fields"><label>Site<select name="site" form="indent-site-switch">${siteOptions}</select><button type="submit" form="indent-site-switch">Use site</button></label>
    ${readOnly('Item name',item?.name??review.item)}${readOnly('HSN code',item?.hsn)}${readOnly('Unit',item?.unit??(!actor.siteEntryTypes?'L':undefined))}
    <label>Entry date<input name="day" type="date" data-required="true" max="${esc(actor.businessDay??doc.day)}" value="${esc(doc.day)}"></label>
    ${render(meta.fields,converted)}</div><p>Enter how many days from the entry date the diesel is required. Use 0 for the same day.</p>
    <p>Required date: <output data-indent-due aria-live="polite"></output></p>
    <p>Indent number: <strong>${esc(doc.number||indentSeries(doc).label+'/…')}</strong>${doc.number?'':' · generated on submission (001, 002, …)'}</p>`;
}

export function indentReadDetails(doc,meta,actor) {
  const item=doc.indentItem??meta.indentItem;
  return `<dt>Site</dt><dd>${esc(doc.site)}</dd><dt>Entry date</dt><dd>${esc(doc.day)}</dd>
    <dt>Item name</dt><dd>${esc(item?.name??doc.result.item??review.item)}</dd>
    <dt>HSN code</dt><dd>${esc(item?.hsn??'—')}</dd><dt>Unit</dt><dd>${esc(item?.unit??(!actor.siteEntryTypes?'L':'—'))}</dd>`;
}
