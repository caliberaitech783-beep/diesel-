export const itemMaster = [
  {
    name: 'Item details',
    fields: [
      { label: 'Item Code', required: true },
      { label: 'Item Name', required: true },
      { label: 'Item Type', required: true },
      { label: 'Group Name', required: true },
      { label: 'Category', required: false },
      { label: 'Measuring Unit', required: true }
    ]
  },
  {
    name: 'Stock and accounts',
    fields: [
      { label: 'Stock A/c', required: true },
      { label: 'Item Nature', required: false },
      { label: 'Valuation Method', required: true },
      { label: 'Consumption / Variation A/c', required: true },
      { label: 'Bulk Density', required: false, type: 'number' }
    ]
  },
  {
    name: 'Specification and tax',
    fields: [
      { label: 'SN', required: true },
      { label: 'Item Specification', required: true },
      { label: 'HSN Code', required: true },
      { label: 'Quality Required', required: true, options: ['Yes', 'No'] },
      { label: 'Status', required: true },
      { label: 'Attachment', required: false, type: 'file' },
      { label: 'HSN Name', required: false }
    ]
  },
  {
    name: 'Diesel settings',
    fields: [
      { label: 'Density minimum (kg/m³)', required: true, type: 'number' },
      { label: 'Density maximum (kg/m³)', required: true, type: 'number' },
      { label: 'Volume basis', required: true, options: ['Observed litres', 'Litres at 15 °C'] },
      { label: 'Reference temperature (°C)', required: false, type: 'number' },
      { label: 'iBoss item code', required: false }
    ]
  }
];
