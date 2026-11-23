export const legacyGstMaster = [
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

export const legacyTdsMaster = [
  {
    name: 'Tax section',
    fields: [
      { label: 'Tax Section Code', required: true },
      { label: 'Tax Section Name', required: true },
      { label: 'Remark', required: false, type: 'textarea' },
      { label: 'Section of Income-tax Act', required: true },
      { label: 'Nature of payment', required: true },
    ],
  },
  {
    name: 'Thresholds and rates',
    fields: [
      { label: 'Threshold: single payment (₹)', required: true, type: 'number' },
      { label: 'Threshold: aggregate in the year (₹)', required: true, type: 'number' },
      { label: 'Buyer turnover condition (₹)', required: false, type: 'number' },
      { label: 'Rate with PAN (%)', required: true, type: 'number' },
      { label: 'Rate without PAN (%)', required: true, type: 'number' },
    ],
  },
  {
    name: 'Applicability and records',
    fields: [
      { label: 'Payee category', required: true },
      { label: 'Applies to (freight, diesel purchase)', required: true },
      { label: 'Effective from', required: true, type: 'date' },
      { label: 'Effective to', required: false, type: 'date' },
      { label: 'Ledger account', required: true },
      { label: 'Attachment (notification, circular)', required: false, type: 'file' },
    ],
  },
];
