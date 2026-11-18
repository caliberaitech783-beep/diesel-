export const routeWiseDieselMaster = [
  {
    name: 'Route details',
    fields: [
      { label: 'Location', required: true },
      { label: 'Entry Date', required: false, type: 'date' },
      { label: 'Entry No.', required: true },
      { label: 'Effective Date', required: true, type: 'date' },
      { label: 'Source', required: true },
      { label: 'Destination', required: true },
      { label: 'Distance In KM', required: true, type: 'number' },
    ],
  },
  {
    name: 'Diesel requirement',
    fields: [
      { label: 'Diesel Required For Loaded Vehicle', required: true, type: 'number' },
      { label: 'Diesel Required For Empty Vehicle', required: true, type: 'number' },
      { label: 'Remark', required: false, type: 'textarea' },
    ],
  },
  {
    name: 'Operating standard',
    fields: [
      { label: 'Vehicle type or model', required: true },
      { label: 'Effective to', required: false, type: 'date' },
      { label: 'Tolerance above standard (%)', required: true, type: 'number' },
      { label: 'Approved by', required: true },
      { label: 'Standard type (per trip / per hour)', required: true, options: ['Per trip', 'Per hour'] },
      { label: 'Standard litres per hour (dumpers, excavators, dozers …)', required: false, type: 'number' },
    ],
  },
];
