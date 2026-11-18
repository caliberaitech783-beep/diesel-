export const cmllMaster = [
  {
    name: 'Company',
    fields: [
      { label: 'Company Code', required: true },
      { label: 'Company Name', required: true },
      { label: 'Comp. Type', required: true },
      { label: 'Owner Name', required: false },
      { label: 'Short Name', required: true },
    ],
  },
  {
    name: 'Office Address',
    fields: [
      { label: 'Office Flat/Door/Block No', required: false },
      { label: 'Office Name of Building', required: false },
      { label: 'Office Road/Street', required: false },
      { label: 'Office Area/Locality', required: false },
      { label: 'Office City', required: true },
      { label: 'Office State', required: true },
      { label: 'Office Pin Code', required: true },
      { label: 'Office Phone No', required: false, type: 'tel' },
      { label: 'Office Email', required: true, type: 'email' },
    ],
  },
  {
    name: 'Works Address',
    fields: [
      { label: 'Works Flat/Door/Block No', required: false },
      { label: 'Works Name of Building', required: false },
      { label: 'Works Road/Street', required: false },
      { label: 'Works Area/Locality', required: false },
      { label: 'Works City', required: false },
      { label: 'Works State', required: false },
      { label: 'Works Pin Code', required: false },
      { label: 'Works Phone No', required: false, type: 'tel' },
      { label: 'Works Email', required: false, type: 'email' },
    ],
  },
  {
    name: 'Other Details',
    fields: [
      { label: 'Registration No', required: true },
      { label: 'Latitude', required: false, type: 'number' },
      { label: 'Longitude', required: false, type: 'number' },
      { label: 'Division', required: false },
    ],
  },
  {
    name: 'Responsible For TDS Deduction',
    fields: [
      { label: 'TDS Person Name', required: true },
      { label: 'TDS Designation', required: true },
      { label: 'TDS Flat No', required: false },
      { label: 'TDS Building', required: false },
      { label: 'TDS Road/Street', required: false },
      { label: 'TDS Area', required: false },
      { label: 'TDS City', required: false },
      { label: 'TDS State', required: false },
      { label: 'TDS PIN Code', required: false },
      { label: 'TDS Phone No', required: false, type: 'tel' },
      { label: 'TDS E-Mail', required: false, type: 'email' },
    ],
  },
  {
    name: 'Attributes',
    fields: [
      { label: 'Attribute Name', required: false },
      { label: 'Attribute Value', required: false },
      { label: 'Attachment', required: false, type: 'file' },
    ],
  },
  {
    name: 'Company / Branch / HO Accounts',
    fields: [
      { label: 'Company / Branch / HO', required: false },
      { label: 'Account', required: false },
    ],
  },
  {
    name: 'Registrations and validity',
    fields: [
      { label: 'State registrations (one line per state)', required: true, type: 'textarea' },
      { label: 'PAN', required: true },
      { label: 'TAN', required: true },
      { label: 'Logo for documents', required: false, type: 'file' },
      { label: 'Attribute valid from', required: false, type: 'date' },
      { label: 'Attribute valid to (expiry alert 30 days before)', required: false, type: 'date' },
    ],
  },
];
