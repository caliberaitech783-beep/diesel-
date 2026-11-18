export const shiftMaster = [
  {
    name: 'Site and shift schedule',
    fields: [
      { label: 'Site', required: true },
      { label: 'Shift name', required: true },
      { label: 'Start time', required: true, type: 'time' },
      { label: 'End time', required: true, type: 'time' },
      { label: 'Business day cut-off', required: true, type: 'time' },
    ],
  },
];
