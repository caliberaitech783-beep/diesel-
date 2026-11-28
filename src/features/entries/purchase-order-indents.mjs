import { sourceChoices } from './entry-choices.mjs';
import { formatIndentNumber } from './indent-details.mjs';

// Only approved indents of this PO's selected site, with their uncommitted balance.
export function purchaseOrderIndents(doc, rows, actor) {
  const site = doc.rev ? doc.site : actor.selectedSite ?? actor.site;
  if (!site || site !== doc.site || site !== actor.site) return [];
  const local = rows.filter(row => row.site === site);
  return sourceChoices({ source: 'E1' }, doc, local, actor).map(row => {
    const ordered = local.filter(order => order.type === 'E2' && order.id !== doc.id && order.data.indent === row.id
      && !['Draft', 'Returned', 'Superseded'].includes(order.status)).reduce((sum, order) => sum + Number(order.result.litres ?? 0), 0);
    return { value: row.id, label: formatIndentNumber(row.number), site, day: row.day,
      litres: row.result.litres, remaining: Math.max(0, row.result.litres - ordered), remarks: row.data.remarks ?? '' };
  }).sort((a, b) => b.day.localeCompare(a.day) || a.label.localeCompare(b.label, 'en', { numeric: true }));
}
