export const storageLocationMaster = [
  {
    name: 'Storage location',
    fields: [
      { label: 'Storage Loc Code', required: true },
      { label: 'Storage Loc. Name', required: true },
      { label: 'Short Name', required: false },
      { label: 'Parent', required: false },
      { label: 'Location', required: true },
      { label: 'Is Out Of Premises', required: false, options: ['Yes', 'No'] },
      { label: 'Is Tank', required: false, options: ['Yes', 'No'] },
      { label: 'Allow in Mobile Apps', required: true, options: ['Yes', 'No'] },
    ],
  },
  {
    name: 'Tank capacity and calibration',
    fields: [
      { label: 'Storage type', required: true, key: 'storage-type', suggestions: ['UG tank', 'Bowser', 'Tank truck (TT)'] },
      { label: 'Capacity (L)', required: true, type: 'number' },
      { label: 'Safe fill level (L)', required: true, type: 'number' },
      { label: 'Minimum level (L)', required: true, type: 'number' },
      { label: 'Calibration chart (dip-to-litres table, UG tanks)', required: true, key: 'calibration-chart', type: 'textarea' },
      { label: 'Dispenser or flow meter ID', required: true },
    ],
  },
  {
    name: 'Bowser and location details',
    fields: [
      { label: 'Bowser registration No.', required: false },
      { label: 'Home tank', required: false },
      { label: 'Compartments and capacity', required: false, type: 'textarea' },
      { label: 'GPS location', required: true },
    ],
  },
  {
    name: 'Alerts and status',
    fields: [
      { label: 'TT empty alert after (hours)', required: false, type: 'number' },
      { label: 'TT empty message to (Telegram)', required: false },
      { label: 'Status', required: true },
    ],
  },
];
