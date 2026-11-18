export const measuringInstrumentMaster = [
  {
    name: 'Instrument details',
    fields: [
      { label: 'Instrument ID', required: true },
      { label: 'Type', required: true, options: ['Dip rod', 'Gauge', 'Flow meter', 'Dispenser meter'] },
      { label: 'Fitted on (tank, bowser)', required: true },
    ],
  },
  {
    name: 'Calibration',
    fields: [
      { label: 'Calibration date', required: true, type: 'date' },
      { label: 'Calibration due date', required: true, type: 'date' },
      { label: 'Certificate copy', required: true, type: 'file' },
      { label: 'Status', required: true },
    ],
  },
];
