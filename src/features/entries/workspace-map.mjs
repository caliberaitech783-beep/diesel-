// The Diesel Workspace groups every entry under the department's own headings.
// The entries themselves, their numbers, approvals and calculations are unchanged; this is only how they are laid out.
import { byId, entries } from './catalog.mjs';
import { pilotEntry } from './entry-access.mjs';
import { mayViewEntryType } from './entry-visibility.mjs';

const svg = paths => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
export const icons = {
  dashboard: svg('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'),
  workspace: svg('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>'),
  masters: svg('<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  buy: svg('<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M3 4h2.5l2.2 11h10.6l2-8H7"/>'),
  receive: svg('<path d="M12 3 4 7v10l8 4 8-4V7z"/><path d="m4 7 8 4 8-4M12 11v10M9 14.5l2 2 4-4"/>'),
  stock: svg('<path d="M3 21V9l9-5 9 5v12"/><path d="M7 21v-8h10v8M7 17h10"/>'),
  fuel: svg('<path d="M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16M3 21h13M7 7h5v4H7z"/><path d="M15 10h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V8l-3-3"/>'),
  accounts: svg('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>'),
  control: svg('<path d="M12 3 5 6v6c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6z"/><path d="m9 12 2 2 4-4"/>'),
  module: svg('<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>'),
  arrow: svg('<path d="M5 12h14m-6-6 6 6-6 6"/>'),
  calendar: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  bell: svg('<path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7 2.5 7h-17S6 15 6 9z"/><path d="M10 20a2 2 0 0 0 4 0"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
};

// One line on what each entry is for, shown on its tile.
const purposes = {
  E1: 'Diesel requirement raised by a site', E2: 'Order placed on the supplier', E3: 'Payment instruction against a PO',
  E4: 'Allocate tanker vehicle to a site', E6: 'Quality and quantity check of the tanker', E7: 'Gate entry and final receipt of diesel',
  E8: 'Book supplier bills against receipts', E9: 'Debit notes and transporter freight bills', E13: 'Recover diesel issued to contractors',
  E10A: 'Fill a bowser from the underground tank', E10B: 'Fill a bowser from the tank truck', E10C: 'Confirm the tank truck is empty',
  E11: 'Diesel issued to a vehicle or machine', E12: 'Transfer diesel from one site to another', E14: 'Diesel bought at a retail pump',
  E15: 'Daily dip count against book stock', E16: 'Ask for a posted entry to be corrected', E17: 'Close the month for a site',
};

export const categories = [
  { id: 'buy', name: 'BUY', icon: 'buy', about: 'Requirement, ordering, payment and tanker allocation', types: ['E1', 'E2', 'E3', 'E4'] },
  { id: 'receive', name: 'RECEIVE', icon: 'receive', about: 'Tanker arrival, checks and goods receipt', types: ['E6', 'E7'] },
  { id: 'stock', name: 'STOCK STORAGE MANAGEMENT', icon: 'stock', about: 'Movement of diesel between sites and storages', types: ['E12', 'E10A', 'E10B', 'E10C', 'E14'] },
  { id: 'vehicle-fuel', name: 'VEHICLE FUEL ENTRY', icon: 'fuel', about: 'Diesel issued to vehicles and equipment', types: ['E11'] },
  { id: 'accounts', name: 'ACCOUNTS & BILLING', icon: 'accounts', about: 'Supplier bills, debit notes and recoveries', types: ['E8', 'E9', 'E13'] },
  { id: 'control', name: 'CONTROL', icon: 'control', about: 'Daily count, corrections and month-end close', types: ['E15', 'E16', 'E17'] },
];
export const categoryOf = type => categories.find(category => category.types.includes(type));

// The gate entry is now part of the goods receipt note, so it no longer has its own place in the menu.
const offMenu = new Set(['E5']);

// The entries this person's menu offers, in catalog order. `active` keeps the entry being viewed in the list.
export function menuEntries(actor, active) {
  const { assignments: assigned, siteEntryTypes: types } = actor;
  const available = types ? entries.filter(entry => types.includes(entry.id))
    : (assigned ? entries.filter(entry => pilotEntry(entry.id)) : entries).filter(entry => !offMenu.has(entry.id));
  return types && assigned ? available.filter(entry => entry.id === active || mayViewEntryType(entry.id, actor)) : available;
}

// Categories with the modules this person may open; a category with none is left out.
export function workspaceFor(actor) {
  const allowed = new Set(menuEntries(actor).map(entry => entry.id));
  return categories.map(category => ({ ...category,
    modules: category.types.filter(type => allowed.has(type)).map(type => ({ ...byId[type], about: purposes[type] ?? '' })) }))
    .filter(category => category.modules.length);
}
