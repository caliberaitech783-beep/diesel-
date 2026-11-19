// Local review fixtures only. Rates and limits are illustrative, not company approvals.
export const sites = ['Jayant', 'Sasti'];
export const roles = ['Site In-charge','Project Manager','Head – Procurement','Director / CMD','Procurement Executive',
  'Accounts Executive','Head – Accounts','CFO','Treasury','Site Store','Point operator','Bowser operator'];
export const roleKey = role => 'entry-' + roles.indexOf(role);
export const entryRole = actor => (actor.profile==='entry-deputy'?'Site In-charge':roles.find(role => roleKey(role) === actor.profile))
  ?? (actor.canApproveMasters ? 'Project Manager' : 'Site In-charge');

export const review = {
  item: '19726 · Diesel (HSD BS VI)', supplier: 'Sample Oil Depot', depot: 'Review depot', pump: 'Sample retail pump',
  transporter: 'Sample carrier', driver: 'Review driver', party: 'Review contractor', bank: 'Review supplier bank',
  invoiceTotal: 900000, invoiceLitres: 10000, freightPerKL: 1200, shortageRate: 90000,
  vatPercent: 0, purchaseTdsPercent: 0, freightTdsPercent: 0, freightGstPercent: 0, reverseCharge: false,
  purchaseTdsThreshold: 0, purchaseTdsEligible: true, invoiceDiscount: 0, postSaleDiscount: 0,
  projectState: { Jayant:'Madhya Pradesh', Sasti:'Maharashtra' },
  recoveryParties: { 'Review contractor': {basis:'Fixed rate', rate:90000}, 'Review hire party': {basis:'Weighted landed cost'} },
  densityMin: 815, densityMax: 845, instrument: 'Review dip rod', calibrationDue: '2099-12-31',
  observedLitres: true, dipChart: [[0,0],[100,10000],[200,20000]],
  tolerance: 0, transferLimit: 0.5, countLimit: 0.5, repeatHours: 6, meterJump: 24,
  indentSlab: 200000, poSlab: 10000000, ttAlertHours: 12, cutOffHour: 6,
  tank: { label: 'UG tank 01', opening: 2000, capacity: 20000, safe: 19000 },
  bowser: { label: 'Bowser 01', opening: 500, capacity: 5000, safe: 4800 },
  vehicles: { 'Fleet 01': { owner: 'Own', capacity: 350, costCentre: 'Fleet operations', standard: 10 },
    'Hired 02': { owner: 'Hired', capacity: 400, costCentre: 'Review contractor', standard: 10 },
    'Hired 03': { owner: 'Hired', capacity: 400, costCentre: 'Review hire party', standard: 10 } },
  reasons: ['Operational demand','Transit shortage','Measurement difference','Meter override','Invoice correction'],
};
export const ratePerKL = () => review.invoiceTotal / review.invoiceLitres * 1000;
export const storageLabels = [review.tank.label, review.bowser.label];
export const otherSite = site => sites.find(value => value !== site);
export function litresAtDip(cm) {
  const chart = review.dipChart;
  if (cm < chart[0][0] || cm > chart.at(-1)[0]) throw Error('Dip is outside the calibration chart.');
  for (let i = 1; i < chart.length; i++) {
    const [x,y] = chart[i], [a,b] = chart[i-1];
    if (cm <= x) return b + (cm-a) * (y-b) / (x-a);
  }
}
