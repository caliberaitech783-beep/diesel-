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
  // Everyone the ERP has recorded driving or operating a machine, with the latest site, vehicle and date.
  { slug: 'driver', name: 'Driver Master', siteColumn: 'site', columns: [
    ['empId', 'Emp code'], ['name', 'Driver name'], ['site', 'Last site'], ['vehicle', 'Last vehicle'],
    ['lastDate', 'Last logbook date'], ['source', 'Source'], ['designation', 'Designation'], ['department', 'Department'],
    ['status', 'Status'], ['phone', 'Phone no.'],
  ] },
  { slug: 'shift', name: 'Shift Master', siteColumn: 'site', columns: [
    ['site', 'Site'], ['shiftName', 'Shift'], ['shiftCode', 'Shift code'], ['startTime', 'Start time'], ['endTime', 'End time'],
    ['effectiveFrom', 'Effective from'], ['effectiveTo', 'Effective to'], ['status', 'Status'], ['remarks', 'Remarks'],
  ] },
  // From the ERP company table through Pulse. Optional: an older Pulse reply without it still loads the others.
  { slug: 'company', name: 'Company Master', optional: true, columns: [
    ['code', 'Company code'], ['name', 'Company name'], ['shortName', 'Short name'], ['type', 'Company type'], ['owner', 'Owner name'],
    ['city', 'City'], ['state', 'State'], ['pinCode', 'Pin code'], ['phone', 'Phone no.'], ['email', 'Email'], ['registrationNo', 'GST registration no.'],
  ] },
];

export const pulseMaster = slug => pulseMasters.find(master => master.slug === slug);
export const pulseMastersPath = '/pulse-masters';

// A Diesel master with the same name as a Pulse master is listed once in Master Data, as the Pulse one that holds the data.
export const replacedByPulse = name => pulseMasters.some(master => master.name === name);
