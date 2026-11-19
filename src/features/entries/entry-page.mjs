import { page, esc, option } from './entry-shell.mjs';
import { byId, entries } from './catalog.mjs';
import { entryRole,roleKey,otherSite,review } from './review-masters.mjs';
import { businessDay } from './entry-rules.mjs';
import { sourceChoices } from './entry-choices.mjs';
import { canChooseRole, pilotEntry } from './entry-access.mjs';
import { mayApproveEntry } from './approval-roles.mjs';
import { filterRegister, registerFilters, traceEntries } from './entry-register.mjs';
import { formSteps } from './phone-form-steps.mjs';
import { transferLabel } from './transfer-destination.mjs';

const recordPath=d=>'/entries/record/'+d.id;
function switchTo(role,site,path,label) {
  return `<form method="post" action="/workspace/role"><input type="hidden" name="role" value="${esc(role)}"><input type="hidden" name="site" value="${esc(site)}"><input type="hidden" name="returnTo" value="${esc(path)}"><button>${esc(label)}</button></form>`;
}
const tones = {Posted:'posted', 'Awaiting approval':'waiting', 'Awaiting Treasury':'waiting', 'Receipt review':'waiting', Returned:'returned', 'In transit':'transit'};
const formatDay = new Intl.DateTimeFormat('en-GB', {day:'numeric', month:'short', year:'numeric', timeZone:'UTC'});
function traceLinks({truck, vehicle}) {
  return Object.entries({truck, vehicle}).filter(([, value]) => value).map(([key, value]) =>
    `<a href="/entries?${key}=${encodeURIComponent(value)}">${esc(value)}</a>`).join(' · ');
}
function table(rows, sources = rows) {
  if (!rows.length) return '<p class="empty">No entries match this view.</p>';
  const trace = traceEntries(sources);
  return `<div class="scroll" role="region" aria-label="Entry records" tabindex="0"><table><thead><tr><th>Entry</th><th>Document</th><th>Truck / vehicle</th><th>Business day</th><th>Status</th></tr></thead><tbody>${rows.map(r=>
    `<tr><td><a class="record-link" href="${recordPath(r)}"><small aria-hidden="true">${r.type}</small><span>${esc(byId[r.type].name)}</span></a></td>
    <td class="doc-number">${esc(r.number||'Draft')}</td><td>${traceLinks(trace(r)) || '—'}</td><td><time datetime="${esc(r.day)}">${formatDay.format(new Date(r.day+'T00:00:00Z'))}</time></td><td><span class="status-pill ${tones[r.status]??'draft'}">${esc(r.status)}</span></td></tr>`).join('')}</tbody></table></div>`;
}
export function approvalsPage(actor, rows) {
  return page('My approvals', actor, 'approvals', '/entries/approvals', table(rows.filter(doc => mayApproveEntry(doc, actor)), rows));
}
export function alertsPage(actor, alerts) {
  const list = alerts.map(alert => `<li><strong>${esc(alert.label)}</strong> · ${esc(alert.detail)}
    ${alert.id ? `· <a href="/entries/record/${esc(alert.id)}">${esc(alert.number || 'Open entry')}</a>` : ''}
    ${alert.escalation ? `· Escalated to ${esc(alert.escalation)}` : ''}</li>`).join('');
  return page('My alerts', actor, 'alerts', '/entries/alerts', list ? `<section><ul>${list}</ul></section>` : '<p>No alerts for this role and site.</p>');
}
export function roleHomePage(actor, rows, alerts) {
  const role = entryRole(actor);
  const tasks = entries.filter(entry => (entry.maker === role || (entry.id === 'E15' && role === 'Site Store'))
    && (actor.siteEntryTypes ? actor.siteEntryTypes.includes(entry.id) : !actor.assignments || pilotEntry(entry.id)));
  if (role === 'Bowser operator') tasks.sort((a, b) => Number(b.id === 'E11') - Number(a.id === 'E11'));
  const approvals = rows.filter(doc => mayApproveEntry(doc, actor)).length;
  const links = [
    ...tasks.map(entry => [entry.name, '/entries/new/' + entry.id]),
    ['My approvals (' + approvals + ')', '/entries/approvals'],
    ['My alerts (' + alerts.length + ')', '/entries/alerts'],
  ];
  return page('My work', actor, 'home', '/entries/home',
    `<div class="phone-tasks">${links.map(([label, href]) => `<a href="${href}">${esc(label)}</a>`).join('')}</div>`);
}

export function registerPage(actor,rows,type,query={}) {
  const meta=byId[type], path=meta?'/entries/type/'+type:'/entries';
  const filters=registerFilters(query);
  const { q: text, status, from, to, truck, vehicle } = filters;
  const relevant=filterRegister(rows, type, filters);
  const actorRole=entryRole(actor);
  const canCreate=meta?.maker && (meta.maker===actorRole||type==='E16'||(type==='E15'&&actorRole==='Site Store'));
  const title = meta?.name ?? 'Entry register';
  const heading = `<div class="register-heading"><div><p class="heading-meta">${meta ? esc(meta.group)+' <span> / </span> '+meta.id : esc(actor.site)+' <span> / </span> '+formatDay.format(new Date(businessDay()+'T00:00:00Z'))}</p><h1>${esc(title)}</h1></div>
    ${!meta ? '<a class="hero-action" href="/entries/type/E1">Open diesel indent <span aria-hidden="true">↗</span></a>' : ''}</div>`;
  const exportUrl='/entries/export.csv?'+new URLSearchParams({type:type??'',...filters});
  return page(title,actor,type,path,`${meta?`<div class="bar"><p>${esc(meta.maker??'Generated on approval')}</p>
    ${canCreate?`<a class="primary" href="/entries/new/${type}">New entry</a>`
      : meta.maker ? (canChooseRole(actor, actor.site, roleKey(meta.maker)) ? switchTo(roleKey(meta.maker),actor.site,'/entries/new/'+type,'Start as '+meta.maker) : '')
      : '<span>Generated after an accepted tank inspection or approved empty confirmation.</span>'}</div>`:''}
    ${!meta?`<div class="counts">${[['Draft','Drafts','draft'],['Awaiting approval','Awaiting approval','waiting'],['Posted','Posted','posted']].map(([value,label,tone])=>
      `<a class="${tone}" href="/entries?status=${encodeURIComponent(value)}" ${status===value?'aria-current="true"':''}><span class="count-label">${label}</span><strong>${rows.filter(r=>r.status===value).length}</strong><i class="metric-symbol" aria-hidden="true"></i></a>`).join('')}</div>`:''}
    <section class="register-panel"><div class="panel-head"><h2>Records <small>${relevant.length}</small></h2><a class="export" href="${esc(exportUrl)}"><span aria-hidden="true">↓</span> Export CSV</a></div>
    <form class="filters"><label class="search-field"><span class="sr-only">Search</span><input type="search" name="q" value="${esc(text)}" placeholder="Search document, truck or vehicle"></label><label><span class="sr-only">Status</span><select name="status">${['','Draft','Awaiting approval','Awaiting Treasury','In transit','Receipt review','Returned','Posted','Superseded'].map(s=>option(s,s||'All statuses',s===status)).join('')}</select></label><button>Filter</button>
    <label>From <input name="from" type="date" value="${esc(from)}"></label><label>To <input name="to" type="date" value="${esc(to)}"></label>
    ${truck ? `<input type="hidden" name="truck" value="${esc(truck)}"><span>Truck · ${esc(truck)}</span>` : ''}
    ${vehicle ? `<input type="hidden" name="vehicle" value="${esc(vehicle)}"><span>Vehicle · ${esc(vehicle)}</span>` : ''}
    ${Object.values(filters).some(Boolean)?`<a href="${path}">Clear filters</a>`:''}</form>${table(relevant,rows)}</section>
    ${!meta&&!actor.hosted&&!actor.siteEntryTypes?'<a class="legacy-link" href="/entries/indents">Open existing master-linked indent drafts <span aria-hidden="true">→</span></a>':''}`,heading);
}
function fieldControl(f,d,rows,actor) {
  const raw=d.data[f.key]??'',value=f.oldOptions?.get(raw)??raw,opts=f.type==='link'?sourceChoices(f,d,rows,actor)
    .map(r=>[r.id,r.number+' · '+byId[r.type].name]):f.options?.map(v=>[v,v]);
  const label=esc(f.label);
  if (opts) return `<label>${label}<select name="${f.key}">${option('','Select…',!value&&opts.length!==1)}${opts.map(([v,n])=>{
    const tag=f.optionTags?.get(v);
    return `<option value="${esc(v)}"${tag?` data-tag="${esc(tag)}"`:''}${v===value || (!value&&opts.length===1&&!f.optional)?' selected':''}>${esc(f.optionLabels?.get(v)??n)}</option>`;
  }).join('')}</select></label>`;
  if (f.type==='file') return `<label>${label}<input type="file" name="${f.key}" accept="image/png,image/jpeg,application/pdf" multiple data-saved="${esc(JSON.stringify(Array.isArray(value)?value:[]))}">${Array.isArray(value)?value.map(file=>esc(file.name)).join(', '):''}</label>
    ${f.key==='billPhoto' ? '<button type="button" id="read-invoice">Read invoice photo</button>' : ''}`;
  return `<label>${label}<input name="${f.key}" type="${f.type}" ${f.type==='number'?'step="any"':''} value="${esc(value)}"></label>`;
}
function display(value) {
  if (Array.isArray(value)) return value.map(display).join(', ');
  if (value && typeof value==='object') return value.id&&value.name?`<a href="/entries/file/${esc(value.id)}">${esc(value.name)}</a>`:Object.entries(value).map(([k,v])=>esc(k)+' · '+display(v)).join(', ');
  return typeof value==='number'?esc(value.toLocaleString('en-IN',{maximumFractionDigits:4})):esc(value??'—');
}
function editableFields(meta, doc, rows, actor) {
  const dateControl = `<label>Business day<input name="day" type="date" max="${businessDay()}" value="${doc.day}"></label>`;
  const render = fields => fields.map(field=>fieldControl(field,doc,rows,actor)).join('');
  const steps = formSteps(meta);
  if (!steps) return `<div class="fields">${dateControl}${render(meta.fields)}</div>`;
  return steps.map(({title,fields},index) => `<fieldset class="entry-step" data-step><legend>${esc(title)}</legend>
    <div class="fields">${index===0 ? dateControl : ''}${render(fields)}</div></fieldset>`).join('')
    + '<div class="actions" id="phone-step-navigation" hidden><button type="button" data-step-back>Back</button><span aria-live="polite" data-step-count></span><button type="button" data-step-next>Next</button></div>';
}
export function detailPage(actor,d,rows,history,picture,meta=byId[d.type],remoteApproval=false) {
  const role=entryRole(actor);
  const editable=['Draft','Returned'].includes(d.status)&&d.maker===actor.id&&(meta.maker===role||d.type==='E16'||(d.type==='E15'&&role==='Site Store'));
  const back=d.rev?recordPath(d):'/entries/type/'+d.type, next=d.result.approvals?.[d.stage];
  const reviewable=mayApproveEntry(d,actor);
  const receipt=d.type==='E12'&&actor.site===d.result.destination;
  let switchForm='';
  if (d.status==='Awaiting approval'&&!reviewable) {
    const profile=next==='Site In-charge'&&d.maker===d.site+'-'+roleKey(next)?'entry-deputy':roleKey(next);
    if ((!actor.assignments || d.maker!==actor.id) && canChooseRole(actor,d.site,profile)) {
      switchForm=switchTo(profile,d.site,back,'Review as '+(profile==='entry-deputy'?'Deputy Site In-charge':next));
    }
  }
  if (d.status==='Awaiting Treasury'&&role!=='Treasury') switchForm=switchTo(roleKey('Treasury'),d.site,back,'Open as Treasury');
  if (d.type==='E12'&&['In transit','Receipt review'].includes(d.status)) {
    const needed=d.status==='In transit'?'Site Store':'Project Manager';
    if(!receipt||role!==needed) switchForm=switchTo(roleKey(needed),d.result.destination,back,'Open at '+d.result.destination+' as '+needed);
  }
  const submitButton=name=>`<button class="primary" type="submit" value="${name}">${name}</button>`;
  const displayValue=v=> typeof v==='string' && rows.some(r=>r.id===v)?`<a href="/entries/record/${v}">${esc(rows.find(r=>r.id===v).number)}</a>`:display(v);
  const inputRows=meta.fields.filter(f=>d.data[f.key]!==undefined).map(f=>{
    const value = d.data[f.key];
    const label = actor.siteEntryTypes&&d.type==='E12'&&f.key==='to'
      ? f.optionLabels?.get(value) ?? transferLabel(value, d.result.destination) : value;
    return `<dt>${esc(f.label)}</dt><dd>${displayValue(label)}</dd>`;
  }).join('');
  const resultRows=Object.entries(d.result).filter(([k])=>!['moves','approvals','generateGRN','telegramAllowed'].includes(k)).map(([k,v])=>
    `<dt>${esc(k.replace(/([a-z])([A-Z])/g,'$1 $2'))}</dt><dd>${displayValue(v)}</dd>`).join('');
  return page(meta.name,actor,d.type,back,`<p><a href="/entries/type/${d.type}">← ${meta.id} register</a></p>
    <div class="bar"><strong>${esc(d.number||'New draft')} · ${esc(d.status)}</strong><span>${esc(d.site)} · ${esc(d.day)}</span></div>
    <form id="entry-form" data-id="${d.id}" data-type="${d.type}" data-rev="${d.rev}" data-site="${esc(actor.site)}">
    ${picture?`<section><h2>Site stock</h2><dl>${Object.entries(picture).map(([name,value])=>`<dt>${esc(name)}</dt><dd>${display(value)}</dd>`).join('')}</dl></section>`:''}
    ${editable?`<section><h2>Entry details</h2>${editableFields(meta,d,rows,actor)}
    ${d.type==='E12'&&!actor.siteEntryTypes?`<p>Receiving site · ${otherSite(d.site)}</p>`:''}
    ${['E5','E6','E10A','E10B','E10C','E11','E12','E14','E15'].includes(d.type)?'<div class="actions"><button type="button" id="record-position">Capture GPS</button></div>':''}
    ${meta.fields.some(f=>['bowser','vehicle','tank'].includes(f.key))?'<details><summary>Scan storage or vehicle tag</summary><label>Take a QR photo or choose an image<input id="tag-photo" type="file" accept="image/*" capture="environment"></label><label>QR / barcode scanner input<input id="tag-input" autocomplete="off"></label><button type="button" id="use-tag">Use scanned tag</button></details>':''}</section>`:inputRows?`<section><h2>Entry details</h2><dl>${inputRows}</dl></section>`:''}
    ${resultRows?`<section><h2>Calculated and carried forward</h2><dl>${resultRows}</dl></section>`:''}
    ${d.type==='E17'&&d.status==='Posted'&&['Head – Accounts','CFO'].includes(role)?`<p><a href="/entries/accounting/${d.id}.csv">Download month-end journal</a></p>`:''}
    ${next&&d.status==='Awaiting approval'?`<p>Awaiting ${esc(next)} · step ${d.stage+1} of ${d.result.approvals.length}</p>`:''}
    ${reviewable?'<label>Reason for return<input name="reason"></label>':''}
    ${d.status==='Awaiting Treasury'&&role==='Treasury'?`<p><a href="/entries/bank-file/${d.id}">Download payment advice</a></p><label>Bank UTR<input name="utr"></label><label>Payment date<input type="date" name="paymentDate"></label>`:''}
    ${receipt&&d.status==='In transit'&&role==='Site Store'?`<div class="fields"><label>Received litres<input type="number" step="any" name="received"></label><label>Receipt evidence<input type="file" name="evidence" multiple accept="image/jpeg,image/png,application/pdf"></label><label>Variance reason<select name="reason">${option('','Select…',true)}${(meta.receiptReasons??review.reasons.map(value=>[value,value])).map(([value,label])=>option(value,label,false)).join('')}</select></label></div>`:''}
    <div class="actions">${editable?submitButton('Save draft')+submitButton('Submit'):''}${reviewable?submitButton('Approve')+submitButton('Return'):''}${d.status==='Awaiting Treasury'&&role==='Treasury'?submitButton('Confirm UTR'):''}${receipt&&d.status==='In transit'&&role==='Site Store'?submitButton('Confirm receipt'):''}${receipt&&d.status==='Receipt review'&&role==='Project Manager'?submitButton('Approve transfer variance'):''}</div>
    <output id="entry-message" role="status"></output></form>${switchForm}
    ${remoteApproval?'<div class="actions"><button type="button" id="send-telegram-approval">Review via Telegram</button><output id="telegram-approval-status" role="status"></output></div>':''}
    ${reviewable&&!actor.assignments&&!actor.siteEntryTypes&&d.result.telegramAllowed!==false?`<details class="inbox"><summary>Test Telegram approval locally</summary><button type="button" id="request-otp">Request test SMS</button><output id="sms-code"></output><label>Six-digit code<input id="otp" inputmode="numeric" maxlength="6"></label><button type="button" id="confirm-otp">Confirm approval</button></details>`:''}
    ${history.length?`<section><h2>History</h2><ol>${history.map(h=>`<li>${esc(h.action)} · ${esc(h.actor)} · <time>${esc(h.stamp)}</time></li>`).join('')}</ol></section>`:''}`, undefined, remoteApproval);
}
