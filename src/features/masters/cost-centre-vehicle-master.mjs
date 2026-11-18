export const costCentreVehicleMaster = [
  {
    name: 'Cost centre',
    fields: [
      { label: 'Cost Centre Code', required: true },
      { label: 'Cost Centre Name', required: true },
      { label: 'Cost Centre Type', required: true },
      { label: 'Remark', required: false },
    ],
  },
  {
    name: 'Vehicle details',
    fields: [
      { label: 'Fleet No.', required: true },
      { label: 'Registration No.', required: true },
      { label: 'Vehicle type', required: true },
      { label: 'Make and model', required: true },
      { label: 'Ownership', required: true },
      { label: 'Hire party or contractor', required: false },
      { label: 'Project (location)', required: true },
      { label: 'Chassis No. / Engine No.', required: false },
      { label: 'Status', required: true },
    ],
  },
  {
    name: 'Fuel and meter settings',
    fields: [
      { label: 'Fuel tank capacity (L)', required: true, type: 'number' },
      { label: 'Meter type', required: true, options: ['Hour meter', 'Kilometre meter'] },
      { label: 'Meter reading at go-live', required: true, type: 'number' },
      { label: 'QR or RFID tag No.', required: true },
      { label: 'Minimum hours between fills', required: false, type: 'number' },
    ],
  },
];
