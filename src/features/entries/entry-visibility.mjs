import { entryRole } from './review-masters.mjs';

const store = 'Site Store';
const point = 'Point operator';
const bowser = 'Bowser operator';
const inCharge = 'Site In-charge';
const manager = 'Project Manager';
const buyer = 'Procurement Executive';
const procurement = 'Head – Procurement';
const accounts = 'Accounts Executive';
const finance = 'Head – Accounts';
const director = 'Director / CMD';

const roleMatrix = {
  E1: [inCharge, manager, buyer, procurement, director],
  E2: [buyer, procurement, accounts, 'CFO', director],
  E3: [buyer, accounts, finance, 'CFO', 'Treasury'],
  E5: [store, inCharge],
  E6: [store, point, inCharge, manager],
  E7: [store, inCharge, accounts],
  E8: [accounts, finance, 'CFO'],
  E9: [accounts, finance],
  E10A: [point, inCharge],
  E10B: [store, bowser, inCharge],
  E10C: [bowser, inCharge, accounts],
  E11: [bowser, inCharge, manager],
  E12: [store, inCharge, manager],
  E13: [accounts, finance],
  E14: [store, inCharge, accounts],
  E15: [store, point, inCharge, manager],
  E16: [store, point, bowser, inCharge, accounts, finance],
  E17: [inCharge, manager, finance, 'CFO'],
};

export function mayViewEntryType(type, actor) {
  return roleMatrix[type]?.includes(entryRole(actor)) === true;
}

export function mayViewEntry(doc, actor) {
  if (doc.status === 'Draft') return doc.maker === actor.id;
  return doc.maker === actor.id || mayViewEntryType(doc.type, actor)
    || doc.result.approvals?.includes(entryRole(actor)) === true;
}
