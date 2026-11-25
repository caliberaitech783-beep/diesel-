export const dieselRateMaster = [
  {
    name: 'Supplier and validity',
    fields: [
      { label: 'Location', required: false },
      { label: 'Supplier', required: true },
      { label: 'Depot', required: true },
      { label: 'Price basis (EXMI / Delivered)', required: true, options: ['EXMI', 'Delivered'] },
      { label: 'Effective from', required: true, type: 'date' },
      { label: 'Effective to', required: false, type: 'date' },
    ],
  },
  {
    name: 'Rate components',
    fields: [
      { label: 'Basic rate (₹/Ltr)', required: true, type: 'number', key: 'basic-rate' },
      { label: 'Excise duty (₹/Ltr)', required: true, type: 'number', key: 'excise-duty' },
      { label: 'VAT (%) by state', required: true, type: 'number', key: 'vat-percent' },
      { label: 'Discount (₹/Ltr)', required: false, type: 'number', key: 'rate-discount' },
      { label: 'Discount type (invoice discount / post-sale discount)', required: false, options: ['Invoice discount', 'Post-sale discount'], key: 'rate-discount-type' },
      {
        label: 'Diesel rate (₹/Ltr), worked out',
        required: true,
        type: 'number',
        readOnly: true,
        key: 'worked-out-rate',
        hint: 'Basic rate plus excise duty, less an invoice discount, plus VAT. A post-sale discount comes later by credit note.',
      },
      { label: 'Transportation rate (₹/Ltr)', required: false, type: 'number', key: 'transport-rate' },
      { label: 'Landed cost per litre (₹/Ltr)', required: false, type: 'number', readOnly: true, key: 'landed-cost', hint: 'Diesel rate plus the transportation rate.' },
    ],
  },
];
