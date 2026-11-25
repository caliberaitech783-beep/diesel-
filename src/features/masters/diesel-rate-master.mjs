export const dieselRateMaster = [
  {
    name: 'Supplier and validity',
    fields: [
      { label: 'Location', required: false },
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
      { label: 'Basic rate (₹/KL)', required: true, type: 'number', key: 'basic-rate' },
      { label: 'Excise duty (₹/KL)', required: true, type: 'number', key: 'excise-duty' },
      { label: 'VAT (%) by state', required: true, type: 'number', key: 'vat-percent' },
      { label: 'Discount (₹/KL)', required: false, type: 'number', key: 'rate-discount' },
      { label: 'Discount type (invoice discount / post-sale discount)', required: false, options: ['Invoice discount', 'Post-sale discount'], key: 'rate-discount-type' },
      {
        label: 'Diesel rate (₹/KL), worked out',
        required: true,
        type: 'number',
        readOnly: true,
        key: 'worked-out-rate',
        hint: 'Basic rate plus excise duty, less an invoice discount, plus VAT. A post-sale discount comes later by credit note.',
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
