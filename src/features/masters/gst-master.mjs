export const gstMaster = [
  {
    name: 'GST classification',
    fields: [
      { label: 'GST code', required: true },
      { label: 'Applies to (freight, services)', required: true, options: ['Freight', 'Services'] },
      { label: 'SAC / HSN', required: true },
    ],
  },
  {
    name: 'Tax treatment',
    fields: [
      { label: 'GST rate (%)', required: true, type: 'number' },
      { label: 'Split (IGST, or CGST + SGST)', required: true, options: ['IGST', 'CGST + SGST'] },
      { label: 'Charge type (forward, reverse charge)', required: true, options: ['Forward charge', 'Reverse charge'] },
      { label: 'Input credit allowed (Y/N)', required: true, options: ['Yes', 'No'] },
      { label: 'Effective from', required: true, type: 'date' },
      { label: 'Effective to', required: false, type: 'date' },
      { label: 'Input / RCM ledger', required: true },
    ],
  },
];
