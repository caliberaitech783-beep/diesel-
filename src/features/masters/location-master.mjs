export const locationMaster = [
  {
    name: 'Location details',
    fields: [
      { label: 'Location Code', required: true },
      { label: 'Location Name', required: true },
      { label: 'Short Name', required: false },
      { label: 'Is Division', required: false, options: ['Yes', 'No'] },
      { label: 'Reverse Tax Mechanism Applied', required: false, options: ['Yes', 'No'] },
      { label: 'Shift Wise Driver', required: false },
      { label: 'Remark', required: false, type: 'textarea' },
    ],
  },
  {
    name: 'Location attributes',
    fields: [
      { label: 'Attribute Name', required: false },
      { label: 'Attribute Value', required: false },
      { label: 'Attachment', required: false, type: 'file' },
      { label: 'Remark', required: false, type: 'textarea' },
    ],
  },
  {
    name: 'Site operations',
    fields: [
      { label: 'Client', required: true },
      { label: 'Contract No.', required: false },
      { label: 'Business day cut-off', required: true, type: 'time' },
      { label: 'Site In-charge', required: true },
      { label: 'Project Manager', required: true },
      { label: 'Receipt scenario allowed', required: true },
      { label: 'Site gate geofence', required: false },
    ],
  },
];
