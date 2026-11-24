import { review, storageLabels } from './review-masters.mjs';
import { deliveryColumns } from './purchase-order.mjs';

const text = (key,label,optional=false) => ({key,label,type:'text',optional});
const number = (key,label,optional=false) => ({key,label,type:'number',optional});
const date = (key,label) => ({key,label,type:'date'});
const pick = (key,label,options,optional=false) => ({key,label,type:'select',options,optional});
const link = (key,label,source) => ({key,label,type:'link',source});
const photo = (key,label) => ({key,label,type:'file',multiple:true});
const reason = pick('reason','Reason code',review.reasons,true);
const remarks = text('remarks','Remarks',true);
const bowser = pick('bowser','Bowser',[review.bowser.label]);
const tank = pick('tank','Underground tank',[review.tank.label]);
const vehicle = pick('vehicle','Vehicle or fleet number',Object.keys(review.vehicles));
const driver = pick('driver','Driver',[review.driver]);
const start = number('start','Bowser meter start (L)'), end = number('end','Bowser meter end (L)');
const before = number('before','Dip before (cm)'), after = number('after','Dip after (cm)');
const gate = link('gate','Tanker gate entry','E5'), grn = link('grn','Goods receipt note','E7');
const po = link('po','Purchase order','E2');

export const entries = [
  ['E1','Diesel indent','Buy','Site In-charge',[number('litres','Quantity'),
    {...pick('unit','Unit',['Litre']),default:'Litre'},
    {...pick('priority','Priority',['Normal','Urgent']),default:'Normal'},
    {...number('requiredBy','Required by (days)'),step:1,min:0,max:3650},reason,remarks]],
  ['E2','Purchase order','Buy','Procurement Executive',[link('indent','Approved indent','E1'),{...pick('type','PO type',['Bulk','Retail']),default:'Bulk'},pick('supplier','Supplier',[review.supplier,review.pump]),pick('depot','Depot',[review.depot]),pick('basis','Delivery basis',['Delivered','Ex-depot']),number('kl','Quantity (KL)',true),pick('transporter','Transporter',[review.transporter],true),number('tolerance','Lower transit tolerance (%)',true),pick('terms','Payment terms',['Advance','Credit']),
    // Single-page purchase order. Optional here so earlier KL orders stay valid; purchase-order.mjs requires them on new orders.
    {...date('deliveryDate','Delivery date'),optional:true},text('undersigned','Undersigned (employee)',true),
    pick('transactionType','Transaction type',['Inter State','Intra State'],true),pick('supplyNature','Supply nature',['Non-GST Supplies','GST Supplies'],true),
    text('freightContract','Freight contract No.',true),number('freightRate','Freight rate (₹/L)',true),pick('loadingOnGross','Loading on gross',['Yes','No'],true),
    number('litres','Diesel Qty (L)',true),number('rateBefore','Rate before discount (₹/L)',true),number('rateAfter','Rate after discount (₹/L)',true),
    number('exciseRate','Basic excise duty (₹/L)',true),number('vatPercent','VAT (%)',true),
    pick('shortageFrom','Shortage deduction from',['Transporter','Vendor'],true),pick('shortageMethod','Shortage deduction method',['None','Percent','Fixed'],true),
    number('freightDeductionRate','Freight deduction rate',true),number('advanceAmount','Advance amount (₹)',true),
    text('paymentAdviceLocation','Payment advice location',true),text('paymentAdviceNo','Payment advice No.',true),
    {key:'deliveries',label:'Delivery schedule',type:'rows',columns:deliveryColumns,optional:true}]],
  ['E3','Payment advice and UTR','Buy','Accounts Executive',[po,number('amount','Amount to pay (₹)')]],
  ['E5','Gate entry','Receive','Site Store',[po,pick('scenario','Receipt scenario',['UG tank','Direct to bowsers']),pick('transporter','Transporter',[review.transporter]),text('truck','Truck registration'),text('driver','Driver name'),text('mobile','Driver mobile'),date('fitness','Fitness valid until'),date('licence','Explosive licence valid until'),text('invoice','Supplier invoice number'),date('invoiceDate','Invoice date'),number('litres','Invoice quantity (L)'),text('eway','E-way bill number'),text('seals','Compartment seal numbers (comma-separated)'),pick('intact','Seals intact',['Yes','No']),photo('sealPhotos','Compartment seal photos'),photo('billPhoto','Bill photo')]],
  ['E6','Inspection','Receive','Site Store',[gate,number('density','Observed density (kg/m³)'),number('temperature','Temperature (°C)'),pick('instrument','Measuring instrument',[review.instrument]),{...tank,optional:true},{...before,optional:true},{...after,optional:true},pick('decision','Decision',['Accept','Accept with shortage','Accept part, reject part','Reject']),number('rejected','Rejected litres sent back with the tanker',true),reason,photo('evidence','Inspection note and dip photos')]],
  ['E7','Goods receipt note','Receive',null,[]],
  ['E8','Supplier bill match','Money','Accounts Executive',[grn,text('bill','Supplier bill number'),date('billDate','Bill date'),number('litres','Bill quantity (L)'),number('rate','Bill rate (₹/KL)'),number('vat','VAT (%)'),number('discount','Invoice discount (₹/KL)',true)]],
  ['E9','Debit note and freight bill','Money','Accounts Executive',[grn,text('bill','Freight bill number',true),{...date('billDate','Freight bill date'),optional:true}]],
  ['E10A','UG tank to bowser','Store and issue','Point operator',[tank,bowser,before,after,start,end,photo('evidence','Meter photos'),reason]],
  ['E10B','Tank truck to bowser','Store and issue','Bowser operator',[gate,bowser,start,end,photo('evidence','Meter photos')]],
  ['E10C','Tank truck empty confirmation','Store and issue','Bowser operator',[gate,pick('empty','Confirm tanker is empty',['Yes']),photo('evidence','Empty compartment photos'),reason]],
  ['E11','Vehicle fuel issue','Store and issue','Bowser operator',[bowser,vehicle,driver,number('reading','Vehicle hour meter'),start,end,photo('evidence','Vehicle meter photo'),reason]],
  ['E12','Inter-site transfer','Store and issue','Site Store',[pick('from','Sending storage',storageLabels),pick('to','Receiving storage at other site',storageLabels),bowser,driver,number('sent','Dispatched litres'),photo('evidence','Dispatch meter photo'),reason]],
  ['E13','Contractor recovery','Money','Accounts Executive',[pick('party','Recovery party',Object.keys(review.recoveryParties)),date('fromDate','Period from'),date('toDate','Period to'),pick('method','Recovery method',['Deduct from hire bill','Chargeable debit note'])]],
  ['E14','Retail pump purchase','Store and issue','Site Store',[pick('pump','Retail pump',[review.pump]),vehicle,text('slip','Slip number'),date('slipDate','Slip date'),number('litres','Litres'),number('rate','Rate on slip (₹/L)'),number('total','Slip amount (₹)'),number('reading','Kilometre reading'),photo('evidence','Slip photo')]],
  ['E15','Daily count and reconciliation','Control','Point operator',[number('dip','UG tank dip (cm)'),number('bowserCount','Bowser measured stock (L)'),reason,{...photo('evidence','Variance evidence'),optional:true}]],
  ['E16','Correction request','Control','Original maker',[link('target','Posted entry','correctable'),pick('field','Field to correct',['remarks','reading','rate','total','litres','discount']),text('value','Corrected value'),{...reason,optional:false},photo('evidence','Correction evidence')]],
  ['E17','Month-end close','Control','Head – Accounts',[{key:'month',label:'Month to close',type:'month'},remarks]],
].map(([id,name,group,maker,fields])=>({id,name,group,maker,fields}));
export const byId = Object.fromEntries(entries.map(entry=>[entry.id,entry]));

// A correction may change any typed value or the reason code on an entry its maker posted.
// Paid payment advices, generated GRNs, month closes and corrections themselves are not corrected this way.
export const correctionTypes = entries.filter(entry=>entry.maker && !['E3','E16','E17'].includes(entry.id)).map(entry=>entry.id);
export const correctableFields = type => (byId[type]?.fields ?? [])
  .filter(field=>['number','text','date'].includes(field.type) || field.key==='reason');
// Values that change litres or rupees also need Head – Accounts.
export const moneyField = key => !['reading','temperature','density','requiredBy','billDate','slipDate','fromDate','toDate','remarks','reason','bill','slip','invoice','seals','eway'].includes(key);
{
  const labels = new Map();
  for (const type of correctionTypes) for (const field of correctableFields(type)) if (!labels.has(field.key)) labels.set(field.key, field.label);
  const field = byId.E16.fields.find(item=>item.key==='field');
  field.options = [...labels.keys()];
  field.optionLabels = labels;
}
