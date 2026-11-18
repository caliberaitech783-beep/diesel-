import { itemMaster } from './item-master.mjs';
import { accountMaster } from './account-master.mjs';
import { cmllMaster } from './cmll-master.mjs';
import { costCentreVehicleMaster } from './cost-centre-vehicle-master.mjs';
import { storageLocationMaster } from './storage-location-master.mjs';
import { routeWiseDieselMaster } from './route-wise-diesel-master.mjs';
import { driverMaster } from './driver-master.mjs';
import { taxMasterTds } from './tax-master-tds.mjs';
import { locationMaster } from './location-master.mjs';
import { gstMaster } from './gst-master.mjs';
import { supplierDepotMaster } from './supplier-depot-master.mjs';
import { dieselRateMaster } from './diesel-rate-master.mjs';
import { transportFreightMaster } from './transport-freight-master.mjs';
import { measuringInstrumentMaster } from './measuring-instrument-master.mjs';
import { volumeCorrectionTable } from './volume-correction-table.mjs';
import { approvalLimitMaster } from './approval-limit-master.mjs';
import { toleranceAndAlertMaster } from './tolerance-and-alert-master.mjs';
import { reasonCodeMaster } from './reason-code-master.mjs';
import { shiftMaster } from './shift-master.mjs';
import { documentNumberingMaster } from './document-numbering-master.mjs';

const catalog = [
  ['Item Master', itemMaster],
  ['Account Master', accountMaster],
  ['CMLL Master', cmllMaster],
  ['Cost Centre-Vehicle Master', costCentreVehicleMaster],
  ['Storage Location Master', storageLocationMaster],
  ['Route Wise Diesel Master', routeWiseDieselMaster],
  ['Driver Master', driverMaster],
  ['Tax Master (TDS)', taxMasterTds],
  ['Location Master', locationMaster],
  ['GST Master', gstMaster],
  ['Supplier Depot Master', supplierDepotMaster],
  ['Diesel Rate Master', dieselRateMaster],
  ['Transport Freight Master', transportFreightMaster],
  ['Measuring Instrument Master', measuringInstrumentMaster],
  ['Volume Correction Table', volumeCorrectionTable],
  ['Approval Limit Master', approvalLimitMaster],
  ['Tolerance and Alert Master', toleranceAndAlertMaster],
  ['Reason Code Master', reasonCodeMaster],
  ['Shift Master', shiftMaster],
  ['Document Numbering Master', documentNumberingMaster],
];

export const masters = catalog.map(([name, sections]) => ({
  name,
  slug: name.toLowerCase().replace(/[()]/g, '').replaceAll(' ', '-'),
  sections,
}));
