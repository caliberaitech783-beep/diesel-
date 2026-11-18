export const taxMasterTds = [
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
