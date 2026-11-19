import { entries } from '../entries/catalog.mjs';
import { roles } from '../entries/review-masters.mjs';

// Posts and entry codes are picked, so an approval rule cannot fail on a spelling difference.
const approvable = entries.filter(entry => entry.maker);

export const approvalLimitMaster = [
  {
    name: 'Entry and approval limit',
    fields: [
      { label: 'Entry', required: true, options: approvable.map(entry => entry.id),
        optionLabels: new Map(approvable.map(entry => [entry.id, entry.id + ' · ' + entry.name])) },
      { label: 'Initiator role', required: true, options: roles, hint: 'The post that starts this entry.' },
      { label: 'Applies to (all / bulk PO / retail PO)', required: false, options: ['All', 'Bulk PO', 'Retail PO'] },
      { label: 'Quantity or value slab', required: true, hint: 'Use All, or Above 200000 for indent litres or Above 10000000 for PO value in INR.' },
    ],
  },
  {
    name: 'Approval roles and authorization',
    fields: [
      { label: 'Approver level 1 role', required: true, options: roles },
      { label: 'Approver level 2 role', required: false, options: roles },
      { label: 'Approver level 3 role (e.g. Director / CMD)', required: false, options: roles },
      { label: 'Approval on Telegram with OTP allowed (Y/N)', required: true, options: ['Yes', 'No'] },
      { label: 'Effective from', required: true, type: 'date' },
    ],
  },
];
