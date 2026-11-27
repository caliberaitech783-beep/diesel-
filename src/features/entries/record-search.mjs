// Finding saved entries from the search box, and counting what is waiting for a person.
import { mayApproveEntry } from './approval-roles.mjs';
import { byId } from './catalog.mjs';
import { formatIndentNumber } from './indent-details.mjs';

const text = value => typeof value === 'string' ? value : '';
const partyOf = row => text(row.result?.supplier) || text(row.data?.supplier) || text(row.data?.transporter);
const vehicleOf = row => text(row.result?.vehicle) || text(row.data?.vehicleNo) || text(row.data?.truck) || text(row.data?.vehicle);

// Every word typed must appear in the entry's number, name, site, supplier or vehicle. Newest first, twelve at most.
export function searchRecords(rows, query) {
  const words = String(query ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6);
  if (!words.join('').length || words.join('').length < 2) return [];
  return rows.filter(row => row.rev > 0 && row.number && row.status !== 'Superseded').map(row => {
    const number = formatIndentNumber(row.number), name = byId[row.type]?.name ?? row.type, party = partyOf(row), vehicle = vehicleOf(row);
    return { row, number, name, party, vehicle, hay: [number, row.number, name, row.site, party, vehicle].join(' ').toLowerCase() };
  }).filter(found => words.every(word => found.hay.includes(word)))
    .toSorted((a, b) => b.row.day.localeCompare(a.row.day)).slice(0, 12)
    .map(({ row, number, name, party, vehicle }) => ({ href: '/entries/record/' + row.id, number, name,
      detail: [row.site, party, vehicle, row.status].filter(Boolean).join(' · ') }));
}

// rows: the person's site entries, already marked with any approval they may give (doc.decide).
export function pendingWork(rows, actor) {
  const mine = rows.filter(row => row.maker === actor.id);
  const approvals = rows.filter(row => row.decide || (row.type !== 'E1' && !row.approval && mayApproveEntry(row, actor))).length;
  const returned = mine.filter(row => row.status === 'Returned').length, drafts = mine.filter(row => row.status === 'Draft' && row.rev > 0).length;
  return { approvals, returned, drafts, total: approvals + returned };
}
