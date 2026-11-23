import { legacyGstMaster, legacyTdsMaster } from './legacy-fields.mjs';

export function legacyTaxSections(slug,values) {
  if (slug==='gst-master'&&values?.['GST code']&&!values.Tax_Code) return legacyGstMaster;
  if (slug==='tax-master-tds'&&values?.['Tax Section Code']&&!values.TDS_Code) return legacyTdsMaster;
}

export function legacyTaxIdentity(slug,values) {
  if (!legacyTaxSections(slug,values)) return;
  return slug==='gst-master'?['GST code','Applies to (freight, services)','Effective from']
    : ['Tax Section Code','Tax Section Name','Payee category','Applies to (freight, diesel purchase)','Effective from'];
}

export function percentageValue(raw) {
  const value=String(raw).trim().replace(/\s*%$/,'');
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value)||Number(value)>100) return null;
  return String(Number(value))+'%';
}

// Earlier operational settings keep their original schema and values. These aliases only
// make their identifiers and corresponding fields readable in the workbook-column lists.
export function taxDisplayValues(slug,values) {
  if (!legacyTaxSections(slug,values)) return values;
  const aliases=slug==='gst-master'?{
    Tax_Code:'GST code',
    Total_GST_Rate:'GST rate (%)',
    Effective_From:'Effective from',Effective_TO:'Effective to','SAC/HSN CODE':'SAC / HSN',
  }:{
    TDS_Code:'Tax Section Code',Nature_of_Payment:'Nature of payment',Legacy_Section_1961:'Section of Income-tax Act',
    Deductee_Type:'Payee category','Standard_Rate_%':'Rate with PAN (%)','No_PAN_Rate_%':'Rate without PAN (%)',
    Single_Threshold_INR:'Threshold: single payment (₹)',Aggregate_Threshold_INR:'Threshold: aggregate in the year (₹)',
    GL_Account_Mapping:'Ledger account','Effective From':'Effective from','Effective To':'Effective to',
    'Attachment Notification upload':'Attachment (notification, circular)',
  };
  const projected=Object.fromEntries(Object.entries(aliases).filter(([,key])=>values[key]!==undefined).map(([key,source])=>[key,values[source]]));
  for(const key of ['Total_GST_Rate','Standard_Rate_%','No_PAN_Rate_%']) if(projected[key]!==undefined) projected[key]=percentageValue(projected[key]);
  return projected;
}
