export const approvalLimitMaster = [
  {
    name: 'Entry and approval limit',
    fields: [
      { label: 'Entry', required: true },
      { label: 'Initiator role', required: true },
      { label: 'Applies to (all / bulk PO / retail PO)', required: false, options: ['All', 'Bulk PO', 'Retail PO'] },
      { label: 'Quantity or value slab', required: true },
    ],
  },
  {
    name: 'Approval roles and authorization',
    fields: [
      { label: 'Approver level 1 role', required: true },
      { label: 'Approver level 2 role', required: false },
      { label: 'Approver level 3 role (e.g. Director / CMD)', required: false, suggestions: ['Director', 'CMD'] },
      { label: 'Approval on Telegram with OTP allowed (Y/N)', required: true, options: ['Yes', 'No'] },
      { label: 'Effective from', required: true, type: 'date' },
    ],
  },
];
