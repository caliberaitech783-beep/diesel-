export const dieselRateMaster = [
  {
    name: 'Supplier and validity',
    fields: [
      { label: 'Supplier', required: true },
      { label: 'Depot', required: true },
      { label: 'Price basis (Ex-depot / Delivered)', required: true, options: ['Ex-depot', 'Delivered'] },
      { label: 'Effective from', required: true, type: 'date' },
      { label: 'Effective to', required: false, type: 'date' },
    ],
  },
  {
    name: 'Rate components',
    fields: [
      { label: 'Basic rate (₹/KL)', required: true, type: 'number' },
      { label: 'Excise duty (₹/KL)', required: true, type: 'number' },
      { label: 'VAT (%) by state', required: true, type: 'number' },
      { label: 'Discount (₹/KL)', required: false, type: 'number' },
      { label: 'Discount type (invoice discount / post-sale discount)', required: false, options: ['Invoice discount', 'Post-sale discount'] },
      { label: 'Total invoice amount (₹, including all charges)', required: true, type: 'number', key: 'invoice-total' },
      { label: 'Invoice quantity (L)', required: true, type: 'number', key: 'invoice-litres' },
      {
        label: 'Diesel rate (₹/KL), worked out',
        required: true,
        type: 'number',
        readOnly: true,
        key: 'invoice-rate',
        hint: 'The full invoice amount divided by litres gives ₹/L. One kilolitre is 1,000 litres.',
      },
    ],
  },
  {
    name: 'Notification and approval',
    fields: [
      { label: 'Notification copy', required: true, type: 'file' },
      { label: 'Approved by', required: true },
    ],
  },
];
