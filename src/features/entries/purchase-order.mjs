// Rules for the single-page Diesel Purchase Order (E2): entered rates, footer heads, delivery schedule,
// tolerance, shortage and payment. Older orders entered in KL keep the earlier rules in purchasing.mjs.
import { requireValue as check, round, money } from './entry-rules.mjs';
import { effectiveRecord } from './site-commercial.mjs';
import { review } from './review-masters.mjs';
import { accountVendor } from './account-vendors.mjs';
import { purchaseOrderTotals, rupeesInWords } from './assets/purchase-order-totals.js';

export const deliveryColumns = [
  { key:'date', label:'Delivery date', type:'date' }, { key:'location', label:'Location', type:'text' },
  { key:'address', label:'Delivery address', type:'text', optional:true }, { key:'litres', label:'DSL Qty (L)', type:'number' },
  { key:'vehicle', label:'Vehicle No.', type:'text', optional:true }, { key:'transporter', label:'Transporter name', type:'text', optional:true },
];
export const vehicleNumber = value => String(value ?? '').toUpperCase().replace(/[\s-]/g,'');
const vehiclePattern = /^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$/;

// Approved masters for a live site: supplier, lifting location, transporter, and the Diesel Rate used as a reference.
function siteParties(d,c) {
  const config=c.siteConfig, day=c.doc.day;
  const supplier=config.accounts.find(account=>account.code===d.supplier);
  check(supplier && supplier.pump===(d.type==='Retail'),'Choose an approved supplier or pump matching the PO type.');
  const depot=d.depot || (supplier.pump ? supplier.code : undefined);
  check(depot && (supplier.pump ? depot===supplier.code : config.depots.some(row=>row.supplier===supplier.code&&row.code===depot)),
    'Choose an approved lifting location for this supplier.');
  if (d.transporter) check(config.accounts.some(account=>account.code===d.transporter&&!account.pump),'Choose an approved transporter.');
  const master=effectiveRecord(config.rates,day,row=>row.supplier===supplier.code&&row.depot===depot&&row.basis===d.basis);
  return { depot, master };
}

export function singlePageOrder(d,c,indent,allocated) {
  const litres=round(d.litres??0);
  check(litres>0,'Enter Diesel Qty (L).');
  check(litres<=round(indent.result.litres-allocated),'PO quantity exceeds the remaining indent balance.');
  check(!d.deliveryDate || d.deliveryDate>=c.doc.day,'Choose a delivery date on or after the PO date.');
  check(d.undersigned,'Enter the undersigned employee.');
  check(d.transactionType && d.supplyNature,'Select the transaction type and supply nature.');
  check(d.rateBefore>0 && d.rateAfter>0,'Enter the rate before and after discount.');
  check(d.rateAfter<=d.rateBefore,'The rate after discount cannot be higher than the rate before discount.');
  check((d.vatPercent??0)<=100,'VAT cannot be more than 100%.');
  const exDepot=d.basis==='Ex-depot';
  check(!exDepot || d.freightRate!==undefined,'Enter the freight rate for a To Pay purchase.');
  check(d.tolerance!==undefined,'Enter the tolerance (%).');
  check(d.tolerance<=c.limits.tolerance,'Transit tolerance can only be lowered. The approved limit is '+c.limits.tolerance+'%.');
  check(d.shortageFrom && d.shortageMethod,'Select who the shortage is deducted from and the deduction method.');
  if (d.shortageMethod==='None') check(d.freightDeductionRate===undefined,'Leave the freight deduction rate blank when the method is None.');
  else check(d.freightDeductionRate>0 && (d.shortageMethod!=='Percent'||d.freightDeductionRate<=100),'Enter the freight deduction rate for a Percent or Fixed deduction.');

  // The delivery schedule is no longer entered. Rows on an earlier order are still checked.
  const deliveries=d.deliveries??[];
  for (const [index,row] of deliveries.entries()) {
    const at='Delivery row '+(index+1)+': ';
    check(row.date>=c.doc.day && (!d.deliveryDate || row.date<=d.deliveryDate),at+'the date must fall between the PO date and the delivery date.');
    check(row.litres>0,at+'enter the quantity.');
    check(!row.vehicle || vehiclePattern.test(vehicleNumber(row.vehicle)),at+'enter the vehicle number like MH34BZ4428.');
  }
  const scheduled=round(deliveries.reduce((sum,row)=>sum+row.litres,0));
  check(!deliveries.length || scheduled===litres,'Delivery rows total '+scheduled.toLocaleString('en-IN')+' L. They must total the Diesel Qty of '+litres.toLocaleString('en-IN')+' L.');

  const totals=purchaseOrderTotals(d);
  check(totals.total>0,'The PO amount must be more than zero.');
  if (d.terms==='Advance' && d.advanceAmount!==undefined) check(d.advanceAmount>0 && d.advanceAmount<=totals.total,'The advance amount cannot be more than the PO amount.');
  if (d.terms==='Credit') check(d.advanceAmount===undefined,'Leave the advance amount blank when full payment is not an advance.');

  let parties={ depot:d.depot }, flags={};
  if (c.siteConfig) {
    parties=siteParties(d,c);
    const master=parties.master;
    if (!(master?.rate>0)) flags.noApprovedDieselRate=true;
    else if (Math.abs(master.rate-totals.landedRate*1000)>0.5) flags.rateDiffersFromDieselRateMaster=true;
  } else check(accountVendor(d.supplier) || (d.type==='Retail')===(d.supplier===review.pump),'Select the supplier that matches the PO type.');

  // Later entries work in ₹ per KL: the rate includes excise and VAT, as in the Diesel Rate Master.
  const rate=money(totals.total/litres*1000), freight=exDepot?money(d.freightRate*1000):0;
  const shortageRate=d.shortageMethod==='Fixed'?money(d.freightDeductionRate*1000)
    : d.shortageMethod==='Percent'?money(rate*d.freightDeductionRate/100) : 0;
  const approvals=['Head – Procurement'];
  if (d.type==='Retail') approvals.push('Director / CMD'); else if (totals.total>review.poSlab) approvals.push('CFO');
  return { litres, rate, vat:d.vatPercent??0, invoiceDiscount:money((d.rateBefore-d.rateAfter)*1000),
    postSaleDiscount:parties.master?.postSaleDiscount??0, ...(parties.master?{rateRef:parties.master.id,rateRevision:parties.master.revision}:{}),
    freight, shortageRate, depot:parties.depot, landed:rate+freight, value:totals.total,
    amount:totals.amount, excise:totals.excise, vatAmount:totals.vat, roundOff:totals.roundOff, footerHeads:totals.footer,
    landedRate:totals.landedRate, amountInWords:rupeesInWords(totals.total), scheduledLitres:scheduled,
    shortageParty:d.shortageFrom==='Transporter'?d.transporter??'Transporter':d.supplier, transitTolerance:d.tolerance, ...flags, approvals };
}
