// Approvals inbox: one card per entry waiting on this role, with its checks, photos and inline Approve / Return.
import { esc } from './entry-shell.mjs';
import { byId } from './catalog.mjs';
import { formatIndentNumber } from './indent-details.mjs';

const quiet = new Set(['generateGRN', 'telegramAllowed', 'tds', 'pan', 'tdsFromFirstDay', 'extended']);
const words = key => key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase());
const isImage = name => /\.(jpe?g|png)$/i.test(name ?? '');

// Flags the rules raised on this entry. Each check is [label, tone]: 'alert' for a rule override, 'warn' for a variance.
export function entryChecks(doc) {
  const checks = Object.entries(doc.result ?? {})
    .filter(([key, value]) => value === true && !quiet.has(key))
    .map(([key]) => [words(key), 'alert']);
  for (const key of ['shortage', 'rejected', 'variance', 'otherOpenIndents']) {
    const value = Number(doc.result?.[key]);
    if (value > 0) checks.push([words(key) + ' · ' + value.toLocaleString('en-IN', { maximumFractionDigits: 2 }), 'warn']);
  }
  if (doc.data?.reason) checks.push(['Reason · ' + doc.data.reason, 'warn']);
  return checks;
}

function value(field, raw, rows) {
  if (field.type === 'link') return formatIndentNumber(rows.find(row => row.id === raw)?.number ?? raw);
  return field.optionLabels?.get(raw) ?? (typeof raw === 'number' ? raw.toLocaleString('en-IN', { maximumFractionDigits: 4 }) : raw);
}

export function approvalCard(doc, rows) {
  const meta = byId[doc.type];
  const fields = meta.fields.filter(f => f.type !== 'file' && doc.data[f.key] !== undefined && doc.data[f.key] !== '' && f.key !== 'reason');
  const photos = meta.fields.filter(f => f.type === 'file').flatMap(f => doc.data[f.key] ?? []);
  const checks = entryChecks(doc);
  const steps = doc.result.approvals ?? [];
  return `<article class="approval-card" data-id="${esc(doc.id)}" data-rev="${esc(doc.rev)}" data-type="${esc(doc.type)}">
    <header><a class="record-link" href="/entries/record/${esc(doc.id)}"><small aria-hidden="true">${esc(doc.type)}</small><span>${esc(meta.name)}</span></a>
      <span class="doc-number">${esc(formatIndentNumber(doc.number))}</span><span class="approval-step">Step ${doc.stage + 1} of ${steps.length} · ${esc(steps[doc.stage] ?? '')}</span></header>
    <p class="approval-meta">${esc(doc.site)} · ${esc(doc.day)}${doc.shift ? ' · ' + esc(doc.shift.name) : ''}</p>
    <ul class="checks">${checks.length ? checks.map(([label, tone]) => `<li class="check ${tone}">${esc(label)}</li>`).join('')
      : '<li class="check ok">All checks passed</li>'}</ul>
    ${fields.length ? `<dl>${fields.slice(0, 8).map(f => `<dt>${esc(f.label)}</dt><dd>${esc(value(f, doc.data[f.key], rows))}</dd>`).join('')}</dl>` : ''}
    ${photos.length ? `<div class="photos">${photos.map(file => isImage(file.name)
      ? `<a href="/entries/file/${esc(file.id)}"><img src="/entries/file/${esc(file.id)}" alt="${esc(file.name)}" loading="lazy"></a>`
      : `<a href="/entries/file/${esc(file.id)}">${esc(file.name)}</a>`).join('')}</div>` : ''}
    <form class="approval-actions"><label>Reason for return<input name="reason" autocomplete="off"></label>
      <div class="actions"><button class="primary" value="Approve">Approve</button><button value="Return">Return</button></div>
      <output role="status"></output></form>
  </article>`;
}
