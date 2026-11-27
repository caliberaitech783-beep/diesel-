import { page, esc, option } from './entry-shell.mjs';
import { byId, entries } from './catalog.mjs';
import { entryRole,roleKey,otherSite,review } from './review-masters.mjs';
import { businessDay, money, entryDayMin } from './entry-rules.mjs';
import { sourceChoices } from './entry-choices.mjs';
import { canChooseRole, pilotEntry } from './entry-access.mjs';
import { mayApproveEntry } from './approval-roles.mjs';
import { approvalCard } from './approval-inbox.mjs';
import { decisionForm } from '../indent-approval/approver-page.mjs';
import { orderKind } from '../indent-approval/approval-kinds.mjs';
import { waiting, waitingStates, filterRegister, registerFilters, traceEntries, isRegisterRecord } from './entry-register.mjs';
import { formSteps } from './phone-form-steps.mjs';
import { transferLabel } from './transfer-destination.mjs';
import { localReadingTime } from './entry-calendar.mjs';
import { mayViewEntry, mayViewEntryType } from './entry-visibility.mjs';
import { indentFields, indentReadDetails, indentHeading } from './indent-fields.mjs';
import { purchaseOrderFields, purchaseOrderHeading } from './purchase-order-fields.mjs';
import { dispatchFields, dispatchHeading, dispatchView } from './dispatch-fields.mjs';
import { grnFields, grnHeading } from './grn-fields.mjs';
import { purchaseOrderView } from './purchase-order-view.mjs';
import { indentStatus, formatIndentNumber, formatIndentDate, indentFormData } from './indent-details.mjs';

const recordPath=d=>'/entries/record/'+d.id;
function switchTo(role,site,path,label) {
  return `<form method="post" action="/workspace/role"><input type="hidden" name="role" value="${esc(role)}"><input type="hidden" name="site" value="${esc(site)}"><input type="hidden" name="returnTo" value="${esc(path)}"><button>${esc(label)}</button></form>`;
}
const tones = {Saved:'posted',Posted:'posted', 'Awaiting approval':'waiting', 'Awaiting Treasury':'waiting', 'Receipt review':'waiting', Returned:'returned', 'In transit':'transit'};
const formatDay = new Intl.DateTimeFormat('en-GB', {day:'numeric', month:'short', year:'numeric', timeZone:'UTC'});
function traceLinks({truck, vehicle}) {
  return Object.entries({truck, vehicle}).filter(([, value]) => value).map(([key, value]) =>
    `<a href="/entries?${key}=${encodeURIComponent(value)}">${esc(value)}</a>`).join(' · ');
}
// An indent sent for approval shows the outcome and who decided, with a way back in to edit it.
const approvalTones = {pending:'waiting',approved:'posted',declined:'returned'};
function statusCell(r) {
  if (!r.approval) return `<span class="status-pill ${tones[indentStatus(r)]??'draft'}">${esc(indentStatus(r))}</span>`;
  return `<span class="status-pill ${approvalTones[r.approval.status]}">${esc(r.approval.label)}</span>
    <small class="approval-detail">${esc(r.approval.detail)}</small>${r.decide?` <a class="approval-edit" href="${recordPath(r)}#indent-decision">Approve / decline</a>`:''}${r.canEdit?` <a class="approval-edit" href="${recordPath(r)}">Edit</a>`:''}`;
}
// Quantity and amount as saved on the entry, where it has them.
const quantityOf = r => [r.result?.accepted, r.result?.litres, r.data?.litres].find(value => typeof value === 'number');
const amountOf = r => [r.result?.value, r.result?.amount].find(value => typeof value === 'number');
const figure = value => typeof value === 'number' ? value.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—';
function table(rows, sources = rows, transport = true, figures = false, listed = rows, sites = false) {
  if (!rows.length) return '<p class="empty">No entries match this view.</p>';
  const trace = traceEntries(sources);
  // A register of one entry type also shows quantity and amount, with a total of the records listed.
  // listed: the records drawn on this page. The total always covers every record that matches, drawn or not.
  const quantity = figures && rows.some(r => quantityOf(r) !== undefined), amount = figures && rows.some(r => amountOf(r) !== undefined);
  const sum = pick => rows.filter(r => !['Draft', 'Returned'].includes(r.status)).reduce((total, r) => total + (pick(r) ?? 0), 0);
  const totals = quantity || amount ? `<tfoot><tr><th scope="row" colspan="${(transport ? 3 : 2) + (sites ? 1 : 0)}">Total · ${rows.length} record${rows.length === 1 ? '' : 's'} <small>drafts and returned entries not added</small></th>${quantity ? `<td class="number">${figure(sum(quantityOf))}</td>` : ''}${amount ? `<td class="number">${figure(sum(amountOf))}</td>` : ''}<td colspan="2"></td></tr></tfoot>` : '';
  return `<div class="scroll" role="region" aria-label="Entry records" tabindex="0"><table class="register-table"><thead><tr><th>Entry</th><th>Document</th>${sites?'<th>Site</th>':''}${transport?'<th>Truck / vehicle</th>':''}${quantity?'<th class="number">Quantity (L)</th>':''}${amount?'<th class="number">Amount (₹)</th>':''}<th>Business day</th><th>Status</th></tr></thead>${totals}<tbody>${listed.map(r=>
    `<tr><td><a class="record-link" href="${recordPath(r)}"><span>${esc(byId[r.type].name)}</span></a></td>
    <td class="doc-number">${esc(formatIndentNumber(r.number||'Draft'))}</td>${sites?`<td>${esc(r.site)}</td>`:''}${transport?`<td>${traceLinks(trace(r)) || '—'}</td>`:''}${quantity?`<td class="number">${figure(quantityOf(r))}</td>`:''}${amount?`<td class="number">${figure(amountOf(r))}</td>`:''}<td><time datetime="${esc(r.day)}">${formatDay.format(new Date(r.day+'T00:00:00Z'))}</time></td><td>${statusCell(r)}</td></tr>`).join('')}</tbody></table></div>`;
}
export function approvalsPage(actor, rows) {
  const waiting = rows.filter(doc => doc.type!=='E1'&&mayApproveEntry(doc, actor));
  return page('My approvals', actor, 'approvals', '/entries/approvals', waiting.length
    ? `<p class="inbox-count">${waiting.length} waiting for you as ${esc(entryRole(actor))}</p><div class="approval-list">${waiting.map(doc => approvalCard(doc, rows)).join('')}</div>`
    : '<p class="empty">Nothing is waiting for your approval.</p>');
}
export function alertsPage(actor, alerts) {
  const list = alerts.map(alert => `<li><strong>${esc(alert.label)}</strong> · ${esc(alert.detail)}
    ${alert.id ? `· <a href="/entries/record/${esc(alert.id)}">${esc(formatIndentNumber(alert.number || 'Open entry'))}</a>` : ''}
    ${alert.escalation ? `· Escalated to ${esc(alert.escalation)}` : ''}</li>`).join('');
  return page('My alerts', actor, 'alerts', '/entries/alerts', list ? `<section><ul>${list}</ul></section>` : '<p>No alerts for this role and site.</p>');
}
export function roleHomePage(actor, rows, alerts, today = {}) {
  const role = entryRole(actor);
  const tasks = entries.filter(entry => (entry.maker === role || (entry.id === 'E15' && role === 'Site Store'))
    && (actor.siteEntryTypes ? actor.siteEntryTypes.includes(entry.id) : !actor.assignments || pilotEntry(entry.id)));
  if (role === 'Bowser operator') tasks.sort((a, b) => Number(b.id === 'E11') - Number(a.id === 'E11'));
  const approvals = rows.filter(doc => doc.type!=='E1'&&mayApproveEntry(doc, actor)).length;
  const links = [
    ...tasks.map(entry => [entry.name, '/entries/new/' + entry.id]),
    ['My approvals (' + approvals + ')', '/entries/approvals'],
    ['My alerts (' + alerts.length + ')', '/entries/alerts'],
  ];
  const day = actor.businessDay ?? businessDay();
  const todays = rows.filter(doc => doc.site === actor.site && doc.day === day);
  const litres = value => value === undefined || value === null ? '—' : Number(value).toLocaleString('en-IN', { maximumFractionDigits: 0 }) + ' L';
  const stock = today.stock;
  const tiles = [
    ['Shift', today.shift ?? 'No shift set', formatDay.format(new Date(day + 'T00:00:00Z'))],
    ['Stock now', stock ? litres(stock['Tank and bowser stock (L)']) : 'Not set up',
      stock ? (stock['Days of stock'] !== null && Number.isFinite(Number(stock['Days of stock'])) ? Number(stock['Days of stock']).toLocaleString('en-IN', { maximumFractionDigits: 1 }) + ' days of stock' : '')
        + (Number(stock['In transit (L)']) > 0 ? ' · ' + litres(stock['In transit (L)']) + ' in transit' : '') : 'Opening stock pending'],
    [esc(actor.site) + ' today', todays.length + (todays.length === 1 ? ' entry' : ' entries'),
      todays.filter(doc => doc.status === 'Posted').length + ' posted · ' + todays.filter(doc => doc.status === 'Awaiting approval').length + ' awaiting approval'],
  ];
  const [lead, ...rest] = approvals ? [links.at(-2), ...links.filter(link => link !== links.at(-2))] : links;
  return page('My work', actor, 'home', '/entries/home',
    `<div class="today">${tiles.map(([label, main, note]) => `<div><span>${label}</span><strong>${esc(main)}</strong>${note ? `<small>${esc(note)}</small>` : ''}</div>`).join('')}</div>
    <div class="phone-tasks">${lead ? `<a class="lead" href="${lead[1]}">${esc(lead[0])}</a>` : ''}${rest.map(([label, href]) => `<a href="${href}">${esc(label)}</a>`).join('')}</div>`);
}

export function registerPage(actor,rows,type,query={},sources=rows) {
  rows=rows.filter(isRegisterRecord);
  const meta=byId[type], path=meta?'/entries/type/'+type:'/entries';
  const filters=registerFilters(type==='E1'?{...query,status:'Saved'}:query);
  const { q: text, status, from, to, truck, vehicle } = filters;
  // All entries carries a tab for each kind of entry that has records; kind is the tab chosen.
  const matching=filterRegister(rows, type, filters,sources);
  const kind=!type&&byId[query.kind]&&matching.some(r=>r.type===query.kind)?query.kind:'';
  const relevant=kind?matching.filter(r=>r.type===kind):matching;
  const actorRole=entryRole(actor);
  const canCreate=meta?.maker && (meta.maker===actorRole||type==='E16'||(type==='E15'&&actorRole==='Site Store'));
  const title = meta?.name ?? 'All entries';
  const heading = `<div class="register-heading"><div><p class="heading-meta">${meta ? esc(meta.group) : esc(actor.site)+' <span> / </span> '+formatDay.format(new Date((actor.businessDay??businessDay())+'T00:00:00Z'))}</p><h1>${esc(title)}</h1></div></div>`;
  // sites: the register was opened across sites, from a Dashboard card. The choice travels with every link on the page.
  const wide=typeof query.sites==='string'&&query.sites&&query.sites!==actor.site?query.sites:'';
  const exportQuery=new URLSearchParams({type:type??kind,...filters,...(wide?{sites:wide}:{})});
  // A long register opens with its newest 100 records so the page loads quickly; the rest are one click away.
  const limit=query.rows==='all'?Infinity:Math.min(5000,Math.max(100,Number.parseInt(query.rows,10)||100));
  const rowsLink=rows=>esc(path+'?'+new URLSearchParams({...Object.fromEntries(Object.entries(filters).filter(([,value])=>value)),...(wide?{sites:wide}:{}),...(kind?{kind}:{}),rows}));
  const tabLink=to=>esc(path+'?'+new URLSearchParams({...Object.fromEntries(Object.entries(filters).filter(([,value])=>value)),...(wide?{sites:wide}:{}),...(to?{kind:to}:{})}));
  const kinds=type?[]:entries.filter(entry=>matching.some(r=>r.type===entry.id));
  const tabs=kinds.length>1?`<nav class="entry-tabs" aria-label="Kinds of entry"><a href="${tabLink('')}"${kind?'':' aria-current="page"'}>All<small>${matching.length}</small></a>${kinds.map(entry=>`<a href="${tabLink(entry.id)}"${kind===entry.id?' aria-current="page"':''}>${esc(entry.name)}<small>${matching.filter(r=>r.type===entry.id).length}</small></a>`).join('')}</nav>`:'';
  const more=relevant.length>limit?`<p class="register-more">Showing ${limit} of ${relevant.length} records · <a href="${rowsLink(limit+100)}">Show 100 more</a> · <a href="${rowsLink('all')}">Show all</a></p>`:'';
  // The three cards count the tab in view. On the All tab each also says which kinds of entry those records are, so a
  // draft or a waiting approval can be found in one click. An indent waiting for its sanction counts as awaiting approval.
  const inState={Draft:r=>r.status==='Draft','Awaiting approval':r=>waitingStates.includes(r.status),Posted:r=>r.status==='Posted'};
  const scope=kind?rows.filter(r=>r.type===kind):rows;
  // The status a card's link filters by: every kind of waiting together.
  const stateFor=value=>value==='Awaiting approval'?waiting:value;
  const cardLink=(value,entry)=>esc('/entries?'+new URLSearchParams({status:stateFor(value,entry),...(entry?{kind:entry}:{})}));
  const cards=[['Draft','Drafts','draft'],['Awaiting approval','Awaiting approval','waiting'],['Posted','Posted','posted']];
  const counts=`<div class="counts">${cards.map(([value,label,tone])=>
      `<a class="${tone}" href="${cardLink(value,kind)}" ${status===stateFor(value,kind)?'aria-current="true"':''}><span class="count-label">${label}${kind?' · '+esc(byId[kind].name):''}</span><strong>${scope.filter(inState[value]).length}</strong><i class="metric-symbol" aria-hidden="true"></i></a>`).join('')}</div>
    ${kind?'':`<div class="count-where">${cards.map(([value,label])=>{
      const found=entries.map(entry=>[entry,rows.filter(r=>r.type===entry.id&&inState[value](r)).length]).filter(([,count])=>count);
      return `<p aria-label="${label} by entry">${found.map(([entry,count])=>`<a href="${cardLink(value,entry.id)}">${esc(entry.name)} <b>${count}</b></a>`).join('')}</p>`;
    }).join('')}</div>`}`;
  return page(title,actor,type,path,`${meta?`<div class="bar"><p>${esc(meta.maker??'Generated on approval')}</p>
    ${canCreate?`<a class="primary" href="/entries/new/${type}">New entry</a>`
      : meta.maker ? (canChooseRole(actor, actor.site, roleKey(meta.maker)) ? switchTo(roleKey(meta.maker),actor.site,'/entries/new/'+type,'Start as '+meta.maker) : '')
      : '<span>Generated after an accepted tank inspection or approved empty confirmation.</span>'}</div>`:''}
    ${!meta?counts:''}
    <section class="register-panel"><div class="panel-head"><h2>Records <small>${relevant.length}</small></h2><div class="actions">
    <a class="export" href="${esc('/entries/export.xlsx?'+exportQuery)}">Export Excel</a>
    <a class="export" href="${esc('/entries/export.csv?'+exportQuery)}">Export CSV</a>
    <a class="export" href="${esc('/entries/export.pdf?'+exportQuery)}">Export PDF</a></div></div>
    ${tabs}<form class="filters"><label class="search-field"><span${type==='E1'?'':' class="sr-only"'}>Search</span><input type="search" name="q" value="${esc(text)}" placeholder="${type==='E1'?'Search indent number':'Search document, truck or vehicle'}"></label><label><span${type==='E1'?'':' class="sr-only"'}>Status</span><select name="status">${(type==='E1'?['Saved']:['','Draft',waiting,'Saved','Awaiting approval','Awaiting Treasury','In transit','Receipt review','Returned','Posted','Superseded']).map(s=>option(s,s===waiting?'Waiting (all kinds)':s||'All statuses',s===status)).join('')}</select></label>${type==='E1'?'':'<button>Filter</button>'}
    <label>From <input name="from" type="date" value="${esc(from)}"></label><label>To <input name="to" type="date" value="${esc(to)}"></label>
    ${truck ? `<input type="hidden" name="truck" value="${esc(truck)}"><span>Truck · ${esc(truck)}</span>` : ''}
    ${vehicle ? `<input type="hidden" name="vehicle" value="${esc(vehicle)}"><span>Vehicle · ${esc(vehicle)}</span>` : ''}
    ${type==='E1'?'<button>Filter</button>':''}${Object.values(filters).some(Boolean)?`<a href="${path}">Clear filters</a>`:''}${wide?`<input type="hidden" name="sites" value="${esc(wide)}">`:''}${kind?`<input type="hidden" name="kind" value="${esc(kind)}">`:''}</form>${wide?`<p class="register-wide">Showing ${wide==='all'?'every site you can open':esc(wide)} · <a href="${path}">Show only ${esc(actor.site)}</a></p>`:''}${table(relevant,sources,(type??kind)!=='E1',Boolean(type??kind),relevant.slice(0,limit),Boolean(wide))}${more}</section>
    ${!meta&&!actor.hosted&&!actor.siteEntryTypes?'<a class="legacy-link" href="/entries/indents">Open existing master-linked indent drafts <span aria-hidden="true">→</span></a>':''}`,heading);
}
function fieldControl(f,d,rows,actor) {
  const raw=d.data[f.key]??'',value=f.oldOptions?.get(raw)??raw,opts=f.type==='link'?sourceChoices(f,d,rows,actor)
    .map(r=>[r.id,formatIndentNumber(r.number)+' · '+byId[r.type].name]):f.options?.map(v=>[v,v]);
  const label=esc(f.label);
  const fuelIssues = d.type==='E11' && actor.siteEntryTypes && ['vehicle','bowser'].includes(f.key)
    ? rows.filter(row=>row.type==='E11'&&row.status==='Posted'&&row.day<=d.day) : [];
  const required=f.optional?'':' data-required="true"';
  if (opts) return `<label>${label}<select name="${f.key}"${required}>${option('','Select…',!value&&opts.length!==1)}${opts.map(([v,n])=>{
    const tag=f.optionTags?.get(v);
    const vehicle=f.vehicleDetails?.get(v);
    const reading=vehicle ? fuelIssues.find(row=>row.data.vehicle===v)?.data.reading??vehicle.firstReading : null;
    const meterEnd=f.key==='bowser' ? fuelIssues.find(row=>row.data.bowser===v)?.data.end : undefined;
    const context = vehicle ? ` data-capacity="${esc(vehicle.capacity)}" data-vehicle-type="${esc(vehicle.vehicleType)}"
      data-owner="${esc(vehicle.owner)}" data-cost-centre="${esc(vehicle.costCentre)}" data-last-reading="${esc(reading)}"` : '';
    const homeTank=f.homeTanks?.get(v);
    return `<option value="${esc(v)}"${tag?` data-tag="${esc(tag)}"`:''}${homeTank?` data-home-tank="${esc(homeTank)}"`:''}${context}${meterEnd===undefined?'':` data-last-end="${esc(meterEnd)}"`}${v===value || (!value&&opts.length===1&&!f.optional)?' selected':''}>${esc(f.optionLabels?.get(v)??n)}</option>`;
  }).join('')}</select>${f.vehicleDetails ? '<output data-vehicle-info aria-live="polite"></output>' : ''}</label>`;
  if (f.type==='file') return `<label>${label}<input type="file" name="${f.key}" accept="image/png,image/jpeg,application/pdf" multiple data-saved="${esc(JSON.stringify(Array.isArray(value)?value:[]))}">${Array.isArray(value)?value.map(file=>esc(file.name)).join(', '):''}</label>
    ${f.key==='billPhoto' ? '<button type="button" id="read-invoice">Read invoice photo</button>' : ''}`;
  return `<label>${label}<input name="${f.key}" type="${f.type}"${required} ${f.type==='number'?`step="${f.step??'any'}"${f.min===undefined?'':` min="${f.min}"`}${f.max===undefined?'':` max="${f.max}"`}`:''} value="${esc(value)}">${d.type==='E11'&&actor.siteEntryTypes&&f.key==='end'
    ? '<output data-fuel-preview aria-live="polite"></output>' : ''}</label>`;
}
function display(value) {
  if (Array.isArray(value)) return value.map(display).join(', ');
  if (value && typeof value==='object') return value.id&&value.name?`<a href="/entries/file/${esc(value.id)}">${esc(value.name)}</a>`:Object.entries(value).map(([k,v])=>esc(k)+' · '+display(v)).join(', ');
  return typeof value==='number'?esc(value.toLocaleString('en-IN',{maximumFractionDigits:4})):esc(formatIndentNumber(value??'—'));
}
function editableFields(meta, doc, rows, actor) {
  if (doc.type==='E1') return indentFields(actor,doc,meta,(fields,d)=>fields.map(field=>fieldControl(field,d,rows,actor)).join(''));
  if (doc.type==='E2') return purchaseOrderFields(actor,doc,meta,rows);
  if (doc.type==='E4') return dispatchFields(actor,doc,meta,rows);
  if (doc.type==='E7') return grnFields(actor,doc,meta,rows);
  const readingControl = actor.siteEntryTypes && ['E11','E15'].includes(doc.type)
    ? `<label>Reading time (IST)<input name="readingTime" type="datetime-local" value="${localReadingTime(doc.readingAt)}"></label>` : '';
  const dateControl = `<label>Business day<input name="day" type="date" min="${entryDayMin(actor.businessDay??businessDay(),doc)}" max="${actor.businessDay??businessDay()}" value="${doc.day}"></label>`+readingControl;
  const render = fields => fields.map(field=>fieldControl(field,doc,rows,actor)).join('');
  const steps = formSteps(meta);
  if (!steps) return `<div class="fields">${dateControl}${render(meta.fields)}</div>`;
  return steps.map(({title,fields},index) => `<fieldset class="entry-step" data-step><legend>${esc(title)}</legend>
    <div class="fields">${index===0 ? dateControl : ''}${render(fields)}</div></fieldset>`).join('')
    + '<div class="actions" id="phone-step-navigation" hidden><button type="button" data-step-back>Back</button><span aria-live="polite" data-step-count></span><button type="button" data-step-next>Next</button></div>';
}
export function detailPage(actor,d,rows,history,picture,meta=byId[d.type],remoteApproval=false) {
  const indent=d.type==='E1';
  if(indent) d={...d,data:indentFormData(d)};
  if (indent) remoteApproval=false;
  const role=entryRole(actor);
  const editable=(['Draft','Returned'].includes(d.status)||(indent&&(['Saved','Awaiting approval'].includes(d.status)||(d.status==='Posted'&&d.result?.sanctioned!==undefined&&!rows.some(row=>row.type==='E2'&&row.data?.indent===d.id&&!['Draft','Superseded','Returned'].includes(row.status))))))&&d.maker===actor.id&&(meta.maker===role||d.type==='E16'||(d.type==='E15'&&role==='Site Store'));
  const back=d.rev?recordPath(d):'/entries/type/'+d.type, next=indent?undefined:d.result.approvals?.[d.stage];
  // A purchase order sent to the listed approvers is decided by them, so the review roles get no Approve or Return here.
  const listed=d.type==='E2'&&Boolean(d.approval);
  const reviewable=!indent&&!listed&&mayApproveEntry(d,actor);
  const receipt=d.type==='E12'&&actor.site===d.result.destination;
  const pending=d.type==='E8'&&d.status==='Posted' ? Number(d.result.expectedPostSaleDiscount??0)-Number(d.result.creditReceived??0) : 0;
  const creditOpen=pending>0.004 && d.site===actor.site && ['Accounts Executive','Head – Accounts'].includes(role);
  let switchForm='';
  if (!indent&&!listed&&d.status==='Awaiting approval'&&!reviewable) {
    const profile=next==='Site In-charge'&&d.maker===d.site+'-'+roleKey(next)?'entry-deputy':roleKey(next);
    if ((!actor.assignments || d.maker!==actor.id) && canChooseRole(actor,d.site,profile)) {
      switchForm=switchTo(profile,d.site,back,'Review as '+(profile==='entry-deputy'?'Deputy Site In-charge':next));
    }
  }
  // A purchase order still awaiting approval can be taken back and edited by the role that made it. Once approved it is final.
  const reopen=d.type==='E2'&&d.status==='Awaiting approval';
  const mayReopen=reopen&&d.maker===actor.id&&meta.maker===role;
  if (reopen&&!mayReopen&&(!actor.assignments||d.maker===actor.id)&&canChooseRole(actor,d.site,roleKey(meta.maker))) {
    switchForm+=switchTo(roleKey(meta.maker),d.site,back,'Edit as '+meta.maker);
  }
  if (d.status==='Awaiting Treasury'&&role!=='Treasury') switchForm=switchTo(roleKey('Treasury'),d.site,back,'Open as Treasury');
  if (d.type==='E12'&&['In transit','Receipt review'].includes(d.status)) {
    const needed=d.status==='In transit'?'Site Store':'Project Manager';
    if(!receipt||role!==needed) switchForm=switchTo(roleKey(needed),d.result.destination,back,'Open at '+d.result.destination+' as '+needed);
  }
  // The purchase order and the delivery schedule have their own one-page forms.
  const order=['E2','E4','E7'].includes(d.type)&&editable;
  const orderLabels={'Save draft':'Save as Draft',Submit:d.type==='E4'?'Save Dispatch':d.type==='E7'?'✓ Save &amp; Generate GRN':'Save PO',Edit:'Edit PO'};
  const submitButton=name=>`<button class="${(indent||order)&&name==='Save draft'?'secondary':'primary'}" type="submit" value="${name}"${indent&&name==='Save draft'?' formnovalidate':''}>${order||name==='Edit'?orderLabels[name]??name:name}</button>`;
  const displayValue=v=>{
    const source = typeof v==='string' && rows.find(row=>row.id===v);
    if (!source) return display(v);
    return actor.siteEntryTypes && actor.assignments && !mayViewEntry(source,actor) ? esc(formatIndentNumber(source.number))
      : `<a href="/entries/record/${source.id}">${esc(formatIndentNumber(source.number))}</a>`;
  };
  const inputRows=(d.type==='E1'?indentReadDetails(d,meta,actor):'')+meta.fields.filter(f=>d.data[f.key]!==undefined||(indent&&f.default!==undefined)).map(f=>{
    const value = d.data[f.key]??f.default;
    const label = actor.siteEntryTypes&&d.type==='E12'&&f.key==='to'
      ? f.optionLabels?.get(value) ?? transferLabel(value, d.result.destination)
      : f.key==='routeStandard' ? f.optionLabels?.get(value)??d.result.routeStandard??value : value;
    const fieldLabel=d.type==='E1'&&f.key==='requiredBy'&&typeof value==='string'&&value.includes('-')?'Required by (date)':f.label;
    return indent?`<div><span>${esc(fieldLabel)}</span><strong>${displayValue(label)}</strong></div>`:`<dt>${esc(fieldLabel)}</dt><dd>${displayValue(label)}</dd>`;
  }).join('');
  const resultRows=Object.entries(d.result).filter(([k])=>!['moves','approvals','generateGRN','telegramAllowed'].includes(k)).map(([k,v])=>
    `<dt>${esc(k.replace(/([a-z])([A-Z])/g,'$1 $2'))}</dt><dd>${displayValue(indent&&k==='requiredDate'?formatIndentDate(v):v)}</dd>`).join('');
  const state=indentStatus(d);
  const stock=picture?`<dl>${Object.entries(picture).map(([name,value])=>`<dt>${esc(name)}</dt><dd>${display(value)}</dd>`).join('')}</dl>`:'';
  const recordDetails=indent?`<div class="indent-record-fields">${inputRows}</div>`:`<dl>${inputRows}</dl>`;
  const recordHeading=indent?`<div class="entry-record-heading"><a href="/entries/type/E1">← All indents</a><span class="indent-state ${state==='Saved'?'is-saved':''}">${esc(state)}</span>${d.approval?`<span class="indent-approval is-${d.approval.status}"><strong>${esc(d.approval.label)}</strong> ${esc(d.approval.detail)}</span>`:''}</div>`
    : `<p class="record-back"><a href="/entries/type/${d.type}">← ${meta.code} register</a>${d.type==='E2'&&d.rev>0?` <a class="export pdf-button" href="${recordPath(d)}/purchase-order.pdf">⬇ Download PDF</a>`:''}</p>
      <div class="bar"><strong>${esc(formatIndentNumber(d.number||'New draft'))} · ${esc(listed&&d.approval.status!=='pending'?d.approval.label:d.status)}</strong>${listed?`<span class="indent-approval is-${d.approval.status}"><strong>${esc(d.approval.label)}</strong> ${esc(d.approval.detail)}</span>`:''}<span>${esc(d.site)} · ${esc(d.day)}${d.shift ? ' · '+esc(d.shift.name) : ''}</span></div>`;
  // On paper a record is one page: its form's details, when it was made, and who approved it. The page's heading, status
  // badges, site stock, worked-out figures and history are for the screen only.
  const stamp=value=>value?new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:true}).format(new Date(value))+' IST':'';
  const approvedBy=d.approval&&d.approval.status!=='pending'?d.approval.label+' '+d.approval.detail
    : (found=>found?'Approved by '+found.actor+' · '+stamp(found.stamp):'')(history.findLast?.(h=>/^approve/i.test(h.action)));
  const printHead=d.rev>0?`<div class="print-only print-head"><h1>${esc(meta.name)}${d.number?' · '+esc(formatIndentNumber(d.number)):''}</h1>
    <p>Created on ${esc(stamp(d.created))}${d.createdBy?' by '+esc(d.createdBy):''}</p>
    ${approvedBy?`<p class="print-approval">${esc(approvedBy)}</p>`:''}</div>`:'';
  // The approval prints in the head, beside when the entry was made, so it is always on the first page.
  return page(meta.name,actor,d.type,back,`${printHead}${recordHeading}
    <form id="entry-form" data-id="${d.id}" data-type="${d.type}" data-rev="${d.rev}" data-site="${esc(actor.site)}">
    ${picture&&!indent&&!order?`<section class="site-stock"><h2>Site stock</h2>${stock}</section>`:''}
    ${editable?`<section${indent?' class="indent-form-panel"':order?' class="order-form-panel"':''}><h2${indent||order?' class="sr-only"':''}>Entry details</h2>${editableFields(meta,d,rows,actor)}
    ${d.type==='E12'&&!actor.siteEntryTypes?`<p>Receiving site · ${otherSite(d.site)}</p>`:''}
    ${['E5','E6','E10A','E10B','E10C','E11','E12','E14','E15'].includes(d.type)?'<div class="actions gps"><output id="gps-status" aria-live="polite">GPS is stamped automatically when location is allowed.</output><button type="button" id="record-position">Refresh GPS</button></div>':''}
    ${meta.fields.some(f=>['bowser','vehicle','tank'].includes(f.key))?'<details><summary>Scan storage or vehicle tag</summary><div class="camera-scan"><button type="button" id="scan-camera" hidden>Scan with camera</button><video id="scan-video" playsinline muted hidden></video></div><label>Take a QR photo or choose an image<input id="tag-photo" type="file" accept="image/*" capture="environment"></label><label>QR / barcode scanner input<input id="tag-input" autocomplete="off"></label><button type="button" id="use-tag">Use scanned tag</button></details>':''}</section>`:d.type==='E2'&&d.rev>0?purchaseOrderView(d,rows):d.type==='E4'&&d.rev>0?dispatchView(d,d.data.po?displayValue(d.data.po):''):inputRows?`<section><h2>Entry details</h2>${recordDetails}</section>`:''}
    ${indent?`<details class="indent-secondary" open><summary>Site stock</summary>${picture&&Object.keys(picture).length?stock:`<p>${d.rev||d.selectedSite?'Site stock is currently unavailable.':'Select a location to see its stock.'}</p>`}</details>`:''}
    ${resultRows&&!indent&&!order&&!['E2','E4'].includes(d.type)?`<section class="worked-out"><h2>Calculated and carried forward</h2><dl>${resultRows}</dl></section>`:''}
    ${d.type==='E17'&&d.status==='Posted'&&['Head – Accounts','CFO'].includes(role)?`<p><a href="/entries/accounting/${d.id}.csv">Download month-end journal</a></p>`:''}
    ${next&&d.status==='Awaiting approval'&&!listed?`<p>Awaiting ${esc(next)} · step ${d.stage+1} of ${d.result.approvals.length}</p>`:''}
    ${reviewable?'<label>Reason for return<input name="reason"></label>':''}
    ${d.status==='Awaiting Treasury'&&role==='Treasury'?`<p><a href="/entries/bank-file/${d.id}">Download payment advice</a></p><label>Bank UTR<input name="utr"></label><label>Payment date<input type="date" name="paymentDate"></label>`:''}
    ${creditOpen?`<section><h2>Post-sale discount credit note</h2><p>₹${esc(money(pending))} of ₹${esc(money(d.result.expectedPostSaleDiscount))} is still awaiting a credit note.</p>
      <div class="fields"><label>Credit note number<input name="creditNote" autocomplete="off"></label><label>Amount (₹)<input type="number" step="0.01" min="0.01" name="creditAmount"></label><label>Credit note date<input type="date" name="creditDate"></label></div></section>`:''}
    ${receipt&&d.status==='In transit'&&role==='Site Store'?`<div class="fields"><label>Received litres<input type="number" step="any" name="received"></label><label>Receipt evidence<input type="file" name="evidence" multiple accept="image/jpeg,image/png,application/pdf"></label><label>Variance reason<select name="reason">${option('','Select…',true)}${(meta.receiptReasons??review.reasons.map(value=>[value,value])).map(([value,label])=>option(value,label,false)).join('')}</select></label></div>`:''}
    <div class="actions${order?' order-actions':''}">${order?`<a class="order-cancel" href="/entries/type/${d.type}">✕ Cancel</a>`:''}${editable?(['Draft','Returned'].includes(d.status)?submitButton('Save draft'):'')+submitButton(indent?'Save indent':'Submit'):''}${mayReopen?submitButton('Edit'):''}${reviewable?submitButton('Approve')+submitButton('Return'):''}${d.status==='Awaiting Treasury'&&role==='Treasury'?submitButton('Confirm UTR'):''}${creditOpen?submitButton('Record credit note'):''}${receipt&&d.status==='In transit'&&role==='Site Store'?submitButton('Confirm receipt'):''}${receipt&&d.status==='Receipt review'&&role==='Project Manager'?submitButton('Approve transfer variance'):''}</div>
    <output id="entry-message" role="status"></output></form>${switchForm}
    ${d.type==='E2'&&d.decide?`<section class="indent-decision-panel" id="indent-decision"><h2>Approve this purchase order</h2><p>Select Approve, or select Decline with an optional reason. The first decision stands.</p>${decisionForm(d.decide,recordPath(d),orderKind)}</section>`:''}
    ${indent&&d.decide?`<section class="indent-decision-panel" id="indent-decision"><h2>Approve this indent</h2><p>Requested ${esc(d.data.litres??'')} litres. Enter the sanction quantity and select Approve, or select Decline.</p>${decisionForm(d.decide,recordPath(d))}</section>`:''}
    ${remoteApproval?'<div class="actions"><button type="button" id="send-telegram-approval">Review via Telegram</button><output id="telegram-approval-status" role="status"></output></div>':''}
    ${reviewable&&!actor.assignments&&!actor.siteEntryTypes&&d.result.telegramAllowed!==false?`<details class="inbox"><summary>Test Telegram approval locally</summary><button type="button" id="request-otp">Request test SMS</button><output id="sms-code"></output><label>Six-digit code<input id="otp" inputmode="numeric" maxlength="6"></label><button type="button" id="confirm-otp">Confirm approval</button></details>`:''}
    ${!indent&&history.length?`<section class="record-history"><h2>History</h2><ol>${history.map(h=>`<li>${esc(h.action)} · ${esc(h.actor)} · <time>${esc(h.stamp)}</time>
      ${h.meta ? `<details><summary>Action details</summary><dl>${Object.entries(h.meta).map(([key,value])=>`<dt>${esc(key)}</dt><dd>${display(value)}</dd>`).join('')}</dl></details>` : ''}
      </li>`).join('')}</ol></section>`:''}`, indent?indentHeading(d):order?(d.type==='E4'?dispatchHeading(d):d.type==='E7'?grnHeading(d):purchaseOrderHeading(d)):undefined, remoteApproval,indent&&editable);
}
