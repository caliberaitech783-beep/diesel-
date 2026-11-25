import { tdsRules } from './tds-deduction.mjs';
export const commercialMasters = ['account-master','supplier-depot-master','diesel-rate-master',
  'transport-freight-master','measuring-instrument-master','gst-master','document-numbering-master','tax-master-tds'];

const effective = values => ({ from:values['Effective from'], to:values['Effective to'] });
const amount = value => value===undefined || value==='' ? undefined : Number(value);
// Entry works in ₹ per KL. The masters now take ₹ per litre; a record saved under the earlier per-KL label is read as it was.
const perKl = (values,label) => {
  const litre=amount(values[label.replace('(₹/KL)','(₹/Ltr)')]);
  return litre===undefined ? amount(values[label]) : Math.round((litre*1000+Number.EPSILON)*100)/100;
};

export function commercialMastersFor(data) {
  const accounts = data['account-master'].map(({code,name,values:v,attributes})=>({
    code,name, pump:v['Is Market Petrol Pump']==='Yes', tds:v['TDS / TCS Applicable']==='Yes',
    tdsNature:v['TDS Nature'], tdsPayee:v['TDS Payee Category'],
    tdsFromFirstDay:v['Eligible For TDS Deduction Under 194Q From First Day']==='Yes',
    pan:(attributes??[]).some(row=>row.name==='PAN'&&row.value),
    bankVerified:Boolean(v['Bank details verified by']&&v['Account No']&&v['IFSC Code']&&v['Y/N']!=='No'),
    recovery:v['Recovery rate basis (hire parties, contractors)'],
    address:[v['Office Address 1'],v['Office Address 2'],v['Office City'],v['Office State'],v['Office Pin Code']].filter(Boolean).join(', '),
    contact:v['Contact No.']||v['Office Mobile No']||v['Office Phone No'],
  }));
  return {
    accounts,
    tdsRules:tdsRules(data['tax-master-tds']??[]),
    depots:data['supplier-depot-master'].map(({values:v})=>({
      code:v['Depot name'],name:v['Depot location (city, state)'],supplier:v['Supplier (A/C Code)'],
    })),
    rates:data['diesel-rate-master'].map(({id,revision,values:v})=>({
      id,revision,supplier:v.Supplier,depot:v.Depot,basis:v['Price basis (Ex-depot / Delivered)']??(v['Price basis (EXMI / Delivered)']==='EXMI'?'Ex-depot':v['Price basis (EXMI / Delivered)']),
      rate:perKl(v,'Diesel rate (₹/KL), worked out'),vat:amount(v['VAT (%) by state']),
      invoiceDiscount:v['Discount type (invoice discount / post-sale discount)']==='Invoice discount'?perKl(v,'Discount (₹/KL)')??0:0,
      postSaleDiscount:v['Discount type (invoice discount / post-sale discount)']==='Post-sale discount'?perKl(v,'Discount (₹/KL)')??0:0,
      ...effective(v),
    })),
    freightRates:data['transport-freight-master'].map(({values:v})=>({
      transporter:v.Transporter,depot:v['From depot'],destination:v['To site'],rate:perKl(v,'Freight (₹/KL)'),
      shortageRate:perKl(v,'Shortage deduction rate (₹/KL)'),...effective(v),
    })),
    instruments:data['measuring-instrument-master'].map(({code,values:v})=>({
      code,name:v.Type,storage:v['Fitted on (tank, bowser)'],start:v['Calibration date'],due:v['Calibration due date'],
    })),
    gst:data['gst-master'].filter(row=>row.values['Applies to (freight, services)']==='Freight').map(({values:v})=>({
      code:v['GST code'],name:v['SAC / HSN'],percent:amount(v['GST rate (%)']),
      reverse:v['Charge type (forward, reverse charge)']==='Reverse charge', ...effective(v),
    })),
    numbering:data['document-numbering-master'].map(({values:v})=>({
      entry:v.Entry, prefix:v.Prefix, financialYear:v['Financial year'], next:amount(v['Next number']),
      siteWise:v['Site-wise series (Y/N)']==='Yes',
    })),
  };
}

export function effectiveRecord(records, day, match) {
  const candidates=records.filter(row=>row.from<=day&&(!row.to||day<=row.to)&&match(row))
    .sort((a,b)=>b.from.localeCompare(a.from));
  return candidates[0]?.from===candidates[1]?.from ? null : candidates[0];
}
