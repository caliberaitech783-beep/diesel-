import { review, storageLabels } from './review-masters.mjs';

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
  ['E1','Diesel indent','Buy','Site In-charge',[number('litres','Requested quantity (L)'),date('requiredBy','Required by'),reason,remarks]],
  ['E2','Purchase order','Buy','Procurement Executive',[link('indent','Approved indent','E1'),pick('type','PO type',['Bulk','Retail']),pick('supplier','Supplier',[review.supplier,review.pump]),pick('depot','Depot',[review.depot]),pick('basis','Delivery basis',['Delivered','Ex-depot']),number('kl','Quantity (KL)'),pick('transporter','Transporter',[review.transporter],true),number('tolerance','Lower transit tolerance (%)',true),pick('terms','Payment terms',['Advance','Credit'])]],
  ['E3','Payment advice and UTR','Buy','Accounts Executive',[po,number('amount','Amount to pay (₹)')]],
  ['E5','Gate entry','Receive','Site Store',[po,pick('scenario','Receipt scenario',['UG tank','Direct to bowsers']),pick('transporter','Transporter',[review.transporter]),text('truck','Truck registration'),text('driver','Driver name'),text('mobile','Driver mobile'),date('fitness','Fitness valid until'),date('licence','Explosive licence valid until'),text('invoice','Supplier invoice number'),date('invoiceDate','Invoice date'),number('litres','Invoice quantity (L)'),text('eway','E-way bill number'),text('seals','Compartment seal numbers (comma-separated)'),pick('intact','Seals intact',['Yes','No']),photo('sealPhotos','Compartment seal photos'),photo('billPhoto','Bill photo')]],
  ['E6','Inspection','Receive','Site Store',[gate,number('density','Observed density (kg/m³)'),number('temperature','Temperature (°C)'),pick('instrument','Measuring instrument',[review.instrument]),{...tank,optional:true},{...before,optional:true},{...after,optional:true},pick('decision','Decision',['Accept','Accept with shortage','Reject']),reason,photo('evidence','Inspection note and dip photos')]],
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
