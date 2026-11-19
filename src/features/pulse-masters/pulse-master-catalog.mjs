// Masters that Pulse owns. Diesel shows the approved Pulse records read-only; changes are made in Pulse.
const employeeColumns = [
  ['empId', 'Emp ID'], ['name', 'Employee name'], ['site', 'Site / office'], ['category', 'Category'],
  ['designation', 'Designation'], ['department', 'Department'], ['reportingTo', 'Reports to'], ['status', 'Status'],
  ['gender', 'Gender'], ['doj', 'Date of joining'], ['staffLevel', 'Level'], ['localStatus', 'Local / camp'],
  ['phone', 'Phone no.'], ['email', 'Email'],
];

export const pulseMasters = [
  { slug: 'site', name: 'Site Master', columns: [['name', 'Site'], ['region', 'Region'], ['regionCode', 'Region short name'], ['state', 'State code']] },
  { slug: 'region', name: 'Region Master', columns: [['name', 'Region name'], ['code', 'Short name'], ['state', 'State code'], ['sites', 'Sites']] },
  { slug: 'equipment', name: 'Equipment Master', siteColumn: 'currentLocation', columns: [
    ['door', 'Door / registration'], ['reg', 'Registration no.'], ['currentLocation', 'Current location'],
    ['equipmentName', 'Equipment name'], ['category', 'Equipment category'], ['group', 'Equipment group'],
    ['itemName', 'Item name'], ['itemSpecification', 'Item specification name'], ['acquisitionDate', 'Acquisition date'],
    ['make', 'Make'], ['model', 'Model'], ['manufacturerSerialNo', 'Manufacturer serial no.'], ['engineNo', 'Engine no.'],
    ['chassisNo', 'Chassis no.'], ['documentStatus', 'Document status'], ['asset', 'Asset no.'], ['status', 'Equipment status'],
  ] },
  { slug: 'employee', name: 'Employee Master', siteColumn: 'site', columns: employeeColumns },
  { slug: 'driver', name: 'Driver Master', siteColumn: 'site', columns: employeeColumns },
];

export const pulseMaster = slug => pulseMasters.find(master => master.slug === slug);
export const pulseMastersPath = '/pulse-masters';
