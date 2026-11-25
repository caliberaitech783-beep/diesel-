export const transportFreightMaster = [
  {
    name: 'Transporter and route',
    fields: [
      { label: 'Transporter', required: true },
      { label: 'From depot', required: true },
      { label: 'To site', required: true },
    ],
  },
  {
    name: 'Freight rate and validity',
    fields: [
      { label: 'Freight (₹/Ltr)', required: true, type: 'number' },
      { label: 'Effective from', required: true, type: 'date' },
      { label: 'Effective to', required: false, type: 'date' },
      { label: 'Shortage deduction rate (₹/Ltr)', required: true, type: 'number' },
      { label: 'Approved by', required: true },
    ],
  },
];
