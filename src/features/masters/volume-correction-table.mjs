export const volumeCorrectionTable = [
  {
    name: 'Temperature and density correction',
    fields: [
      { label: 'Observed temperature (°C)', required: true, type: 'number' },
      { label: 'Observed density (kg/m³)', required: true, type: 'number' },
      { label: 'Correction factor', required: true, type: 'number' },
    ],
  },
];
