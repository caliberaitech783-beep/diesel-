export const reasonCodeMaster = [
  {
    name: 'Reason and evidence',
    fields: [
      { label: 'Code', required: true },
      {
        label: 'Used for (rejection, shortage, variance, correction, override)',
        required: true,
        options: ['Rejection', 'Shortage', 'Variance', 'Correction', 'Override'],
      },
      { label: 'Description', required: true, type: 'textarea' },
      { label: 'Evidence required', required: true, options: ['Yes','No'] },
      { label: 'Status', required: true },
    ],
  },
];
