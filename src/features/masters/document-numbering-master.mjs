export const documentNumberingMaster = [
  {
    name: 'Numbering series',
    fields: [
      { label: 'Entry', required: true },
      { label: 'Prefix', required: true },
      { label: 'Financial year', required: true },
      { label: 'Next number', required: true, type: 'number', step: 1 },
      { label: 'Site-wise series (Y/N)', required: true, options: ['Yes', 'No'] },
    ],
  },
];
