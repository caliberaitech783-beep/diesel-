import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { purchaseOrderPdf, purchaseOrderSheet, purchaseOrdersPdf, registerPdf } from './purchase-order-pdf.mjs';
import { purchaseOrderExportRows, purchaseOrdersOnly } from './entry-register.mjs';
import { openDieselDatabase } from '../../data/database.mjs';
import { createEntryStore } from './entry-store.mjs';
import { review, roleKey } from './review-masters.mjs';
import { byId } from './catalog.mjs';
import { businessDay } from './entry-rules.mjs';
import { detailPage, registerPage } from './entry-page.mjs';
import { sourceChoices } from './entry-choices.mjs';
import { purchaseOrderTotals, rupeesInWords } from './assets/purchase-order-totals.js';

const day=businessDay();
const actor=(role,site='Jayant')=>({site,profile:roleKey(role),id:site+'-'+roleKey(role),name:role});
function setup(t) {
  const db=openDieselDatabase(':memory:');t.after(()=>db.close());
  const store=createEntryStore(db);
  const submit=(type,data,action='Submit')=>store.write(randomUUID(),actor(byId[type].maker),{type,rev:0,day,action,data});
  function approve(doc) {
    while(doc.status==='Awaiting approval') doc=store.write(doc.id,actor(doc.result.approvals[doc.stage]),{action:'Approve',rev:doc.rev});
    return doc;
  }
  const indent=approve(submit('E1',{litres:40000,requiredBy:0,reason:review.reasons[0]}));
  const order={indent:indent.id,supplier:review.supplier,depot:review.depot,basis:'Ex-depot',transporter:review.transporter,terms:'Advance',
    deliveryDate:day,undersigned:'Pratik Ashok Bisen',transactionType:'Inter State',supplyNature:'Non-GST Supplies',freightRate:6.2,loadingOnGross:'Yes',
    litres:40000,rateBefore:107.95274,rateAfter:107.95274,exciseRate:7.8,vatPercent:14.9,tolerance:0,shortageFrom:'Transporter',shortageMethod:'None',
    advanceAmount:1000000,deliveries:JSON.stringify([{date:day,location:'Jayant',litres:20000,vehicle:'MH34BZ4428'},{date:day,location:'Jayant',litres:'20000',vehicle:'mh 34 bz 5172',transporter:'Shree Vinayak Transport'}])};
  return {store,submit,approve,indent,order,db};
}

test('purchase order totals follow excise per litre, VAT on amount plus excise, and a whole-rupee round-off', () => {
  const {rows:legacyRows,dieselRate:_diesel,freightRate:_freight,...totals}=purchaseOrderTotals({litres:40000,rateAfter:107.95274,exciseRate:7.8,vatPercent:14.9});
  assert.deepEqual(legacyRows.map(row=>[row.head,row.legend,row.on,row.value]),[['Basic Excise Duty','OQA',40000,312000],['VAT','PRA',4630109.6,689886.33],['Round Off','LSA',null,0.07]]);
  assert.deepEqual(totals,{litres:40000,netRate:107.95274,amount:4318109.6,excise:312000,vatBase:4630109.6,vat:689886.33,roundOff:0.07,
    footer:1001886.4,total:5319996,landedRate:132.9999});
  assert.equal(rupeesInWords(5319996),'Rupees Fifty Three Lakh Nineteen Thousand Nine Hundred Ninety Six Only');
  assert.equal(rupeesInWords(120000000.5),'Rupees Twelve Crore and Fifty Paise Only');
  assert.equal(rupeesInWords(0),'');
  assert.equal(purchaseOrderTotals({}).total,0);
});

test('a single-page purchase order saves its schedule and carries rates forward per KL', t => {
  const {submit,approve,order}=setup(t);
  const po=submit('E2',order);
  assert.equal(po.status,'Awaiting approval');
  assert.equal(po.data.type,'Bulk');
  assert.equal(po.data.deliveries.length,2);
  assert.deepEqual(po.data.deliveries[1],{date:day,location:'Jayant',litres:20000,vehicle:'mh 34 bz 5172',transporter:'Shree Vinayak Transport'});
  const r=po.result;
  assert.deepEqual([r.litres,r.value,r.amount,r.excise,r.vatAmount,r.roundOff,r.footerHeads,r.landedRate],[40000,5319996,4318109.6,312000,689886.33,0.07,1001886.4,139.1999]);
  assert.deepEqual([r.rate,r.vat,r.freight,r.landed,r.invoiceDiscount,r.shortageRate,r.shortageParty,r.transitTolerance],
    [132999.9,14.9,6200,139199.9,0,0,review.transporter,0]);
  assert.equal(r.amountInWords,'Rupees Fifty Three Lakh Nineteen Thousand Nine Hundred Ninety Six Only');
  assert.deepEqual(r.approvals,['Head – Procurement']);
  assert.equal(approve(po).status,'Posted');
  // Payment advice still works against the PO amount.
  const advice=submit('E3',{po:po.id,amount:1000000});
  assert.equal(advice.result.amount,1000000);
});

test('a single-page purchase order is checked before it is saved', t => {
  const {submit,order}=setup(t);
  const rows=changes=>JSON.stringify(JSON.parse(order.deliveries).map((row,index)=>({...row,...(changes[index]??{})})));
  assert.throws(()=>submit('E2',{...order,deliveries:rows([{litres:15000}])}),/must total the Diesel Qty of 40,000 L/);
  assert.throws(()=>submit('E2',{...order,deliveries:rows([{vehicle:'TRUCK-1'}])}),/Delivery row 1: enter the vehicle number/);
  assert.throws(()=>submit('E2',{...order,deliveries:rows([{},{date:'2099-01-01'}])}),/Delivery row 2: the date must fall/);
  assert.throws(()=>submit('E2',{...order,deliveries:'not json'}),/Check the rows in Delivery schedule/);
  assert.throws(()=>submit('E2',{...order,litres:50000}),/remaining indent balance/);
  assert.throws(()=>submit('E2',{...order,rateAfter:120}),/cannot be higher/);
  assert.throws(()=>submit('E2',{...order,deliveryDate:'2000-01-01',deliveries:''}),/delivery date on or after the PO date/);
  assert.throws(()=>submit('E2',{...order,undersigned:''}),/undersigned/);
  assert.throws(()=>submit('E2',{...order,tolerance:2}),/can only be lowered/);
  assert.throws(()=>submit('E2',{...order,shortageMethod:'Fixed'}),/freight deduction rate/);
  assert.throws(()=>submit('E2',{...order,advanceAmount:6000000}),/advance amount/);
  assert.throws(()=>submit('E2',{...order,terms:'Credit'}),/Leave the advance amount and the payment advice details blank/);
  const fixed=submit('E2',{...order,shortageMethod:'Fixed',freightDeductionRate:95});
  assert.equal(fixed.result.shortageRate,95000);
  // The delivery date, the transporter and the delivery schedule are no longer needed, and a vendor comes from the Account Master.
  const {submit:again,order:plain}=setup(t);
  const lean=again('E2',{...plain,deliveryDate:undefined,transporter:undefined,deliveries:'',basis:'To Bill',supplyNature:'Taxable Supplies',supplier:'SANDEEP GASOLENES'});
  assert.deepEqual([lean.status,lean.data.supplier,lean.data.basis,lean.result.freight,lean.result.shortageParty],['Awaiting approval','SANDEEP GASOLENES','To Bill',0,'Transporter']);
  // A draft can be kept half-filled.
  assert.equal(submit('E2',{indent:order.indent,litres:100},'Save draft').status,'Draft');
});

test('New entry on Purchase order opens the one-page form', t => {
  const {store,indent}=setup(t);
  const buyer={...actor('Procurement Executive'),businessDay:day,employee:{name:'Pratik Ashok Bisen',empId:'E100'}};
  const draft=store.fresh('E2',buyer);
  const html=detailPage(buyer,draft,[indent],[],null,store.definition('E2','Jayant'));
  for (const text of ['Diesel Purchase Order','Purchase Order Details','Vendor Details','Tax &amp; Supply','Freight &amp; Logistics','Record Information',
    'Material Details','Final Calculation – Footer / Tax','P.O. Amount','Tolerance &amp; Shortage','Is Full Payment as Advance?','Landing on Gross',
    'value="Save draft">Save as Draft<','value="Submit">Save PO<','purchase-order-form.js']) assert.ok(html.includes(text),text);
  assert.match(html,new RegExp('data-search-for="indent"[^>]*value="">\\s*<input type="hidden" name="indent" value="">'),'the indent starts blank and is searched');
  assert.match(html,new RegExp('<option value="[^"]*IND[^"]*" data-value="'+indent.id+'" data-remaining="40000">'));
  assert.match(html,/data-search-for="supplier"/);
  assert.match(html,/<option value="SANDEEP GASOLENES" data-value="SANDEEP GASOLENES">/);
  assert.match(html,/SANDEEP GASOLENES&quot;:\{&quot;address&quot;:&quot;2, AT-GHUGGUS PHATA, GHUGGUS ROAD, CHANDRAPUR, MAHARASHTRA, 442401&quot;/);
  for (const gone of ['data-deliveries','Add delivery row','name="transporter"','>Paid<','GST Supplies<','Loading on Gross']) assert.ok(!html.includes(gone)||gone==='GST Supplies<'&&!html.includes('>GST Supplies<'),gone);
  assert.match(html,/<option value="Taxable Supplies">Taxable Supplies<\/option>/);
  assert.match(html,/<option value="Delivered">FOR<\/option><option value="Ex-depot">To Pay<\/option><option value="To Bill">To Bill<\/option>/);
  assert.match(html,/data-loading-gross checked><input type="hidden" name="loadingOnGross" value="Yes">Landing on Gross/);
  assert.match(html,/name="deliveryDate" type="date" min=/);
  assert.ok(html.indexOf('Record Information')>html.indexOf('Is Full Payment as Advance?'),'record information comes last');
  assert.match(html,/id="rail-toggle"/);
  assert.match(html,/name="undersigned" type="text" readonly[^>]*value="Pratik Ashok Bisen · E100"/);
  const {employee:_none,...unmatched}=buyer;
  assert.match(detailPage({...unmatched,requestedBy:'SIDDHARTH HOONKA'},draft,[indent],[],null,store.definition('E2','Jayant')),/name="undersigned" type="text" readonly[^>]*value="SIDDHARTH HOONKA"/);
  assert.match(html,/<option value="Ex-depot">To Pay<\/option>/);
  assert.doesNotMatch(html,/name="kl"/);
  assert.doesNotMatch(html,/data-step/);
});

test('the maker reopens a purchase order awaiting approval, edits it and sends it again', t => {
  const {store,submit,approve,order,db}=setup(t);
  let po=submit('E2',order);
  assert.equal(po.status,'Awaiting approval');
  const maker=actor('Procurement Executive'), number=po.number;
  assert.match(detailPage(maker,po,store.list('Jayant'),[]),/value="Edit">Edit PO<\/button>/);
  const other=detailPage(actor('Site Store'),po,store.list('Jayant'),[]);
  assert.doesNotMatch(other,/value="Edit"/);
  assert.match(other,/<button>Edit as Procurement Executive<\/button>/);
  assert.throws(()=>store.write(po.id,actor('Site Store'),{action:'Edit',rev:po.rev}),/original maker/);
  po=store.write(po.id,actor(po.result.approvals[0]),{action:'Approve',rev:po.rev});
  if (po.status==='Awaiting approval') {
    po=store.write(po.id,maker,{action:'Edit',rev:po.rev});
    assert.deepEqual([po.status,po.stage,po.number],['Draft',0,number]);
    assert.match(detailPage(maker,po,store.list('Jayant'),[]),/value="Submit">Save PO<\/button>/);
    po=store.write(po.id,maker,{type:'E2',action:'Submit',rev:po.rev,day,data:{...order,tolerance:1}});
    assert.deepEqual([po.status,po.stage,po.number,Number(po.data.tolerance)],['Awaiting approval',0,number,1]);
  }
  const posted=submit('E1',{litres:100,requiredBy:0,reason:review.reasons[0]});
  assert.throws(()=>store.write(posted.id,actor('Site In-charge'),{action:'Edit',rev:posted.rev}),/Only a purchase order awaiting approval/);

  // After approval the order is final: no Edit button and no way to reopen it.
  po=approve(po.status==='Draft'?store.write(po.id,maker,{type:'E2',action:'Submit',rev:po.rev,day,data:order}):po);
  assert.equal(po.status,'Posted');
  assert.doesNotMatch(detailPage(maker,po,store.list('Jayant'),[]),/value="Edit"|Edit as Procurement Executive/);
  assert.throws(()=>store.write(po.id,maker,{action:'Edit',rev:po.rev}),/An approved purchase order cannot be edited/);
});

test('footer heads and legends chosen on the order decide how each amount is worked out', t => {
  const rows=[{head:'Basic Excise Duty',legend:'OQA',rate:2},{head:'Discount',legend:'PAD',rate:10},{head:'VAT',legend:'PRA',rate:10},
    {head:'Cess',legend:'LSA',rate:50.4},{head:'',legend:''},{head:'Round Off',legend:'LSA'}];
  const totals=purchaseOrderTotals({litres:100,rateAfter:90,footerRows:rows});
  // 9,000 basic; +200 excise on quantity; -900 discount on the basic amount; +830 VAT on the running 8,300; +50.40 lump sum; rounded.
  assert.deepEqual(totals.rows.map(row=>[row.on,row.value]),[[100,200],[9000,-900],[8300,830],[null,50.4],[null,0],[null,-0.4]]);
  assert.deepEqual([totals.amount,totals.excise,totals.vat,totals.vatBase,totals.roundOff,totals.footer,totals.total,totals.landedRate],[9000,200,830,8300,-0.4,180,9180,91.8]);
  assert.equal(purchaseOrderTotals({litres:100,rateAfter:90,footerRows:[{head:'Cess',legend:'OQD',rate:0.255}]}).total,8974.5,'without Round Off the amount is not rounded');

  const {submit,order,store}=setup(t);
  const {exciseRate,vatPercent,...base}=order;
  assert.throws(()=>submit('E2',{...base,footerRows:JSON.stringify([{head:'Octroi',legend:'LSA',rate:1}])}),/Footer row 1: choose a footer head from the list/);
  assert.throws(()=>submit('E2',{...base,footerRows:JSON.stringify([{head:'VAT',legend:'XYZ',rate:1}])}),/Footer row 1: choose a legend from the list/);
  assert.throws(()=>submit('E2',{...base,footerRows:JSON.stringify([{head:'VAT',legend:'PRA',rate:101}])}),/a percent cannot be more than 100/);
  assert.throws(()=>submit('E2',{...base,footerRows:JSON.stringify([{head:'VAT',legend:'PRA'}])}),/enter the rate or percent/);

  const po=submit('E2',{...base,depot:'IOCL Tadali depot',footerRows:JSON.stringify(rows.filter(row=>row.head)),advanceAmount:100});
  assert.deepEqual([po.status,po.data.depot,po.result.vat,po.result.excise,po.result.vatAmount,po.data.footerRows.length],['Awaiting approval','IOCL Tadali depot',10,80000,396629.86,5]);
  const buyer={...actor('Procurement Executive'),businessDay:day};
  const html=detailPage(buyer,store.fresh('E2',buyer),[],[],null,store.definition('E2','Jayant'));
  assert.match(html,/name="depot" type="text" data-required="true"[^>]*placeholder="Enter lifting location" value="">/);
  assert.equal(html.match(/data-foot="head"/g).length,5);
  assert.match(html,/<tr><td>1<\/td>\s*<td><select data-foot="head" aria-label="Footer head 1"><option value="">Select…<\/option><option>Basic Excise Duty<\/option><option>VAT<\/option><option>Cess<\/option><option>Discount<\/option><option>Round Off<\/option>/);
  assert.match(html,/<select data-foot="legend" aria-label="Legend 1"><option value="">Select…<\/option><option>LSA<\/option><option>LSD<\/option><option>OQA<\/option><option>OQD<\/option><option>PRA<\/option><option>PRD<\/option><option>PAA<\/option><option>PAD<\/option>/);
  assert.equal(html.match(/<tr hidden><td>\d<\/td>/g).length,4,'a new order shows one footer row; the rest wait behind Add footer row');
  assert.match(html,/data-add-footer-row>\+ Add footer row</);
  assert.doesNotMatch(html,/name="exciseRate"|name="vatPercent"/);
});

test('a purchase order download has a column for every field, its totals, and who created it and when', t => {
  const {store,order,indent,db}=setup(t);
  const maker={...actor('Procurement Executive'),requestedBy:'SIDDHARTH HOONKA'};
  const {exciseRate,vatPercent,...base}=order;
  let po=store.write(randomUUID(),maker,{type:'E2',action:'Submit',rev:0,day,data:{...base,depot:'IOCL Tadali',basis:'Ex-depot',freightRate:1.5,
    footerRows:JSON.stringify([{head:'Basic Excise Duty',legend:'OQA',rate:7.8},{head:'VAT',legend:'PRA',rate:14.9},{head:'Round Off',legend:'LSA'}])}});
  assert.equal(po.createdBy,'SIDDHARTH HOONKA');
  // Another person in the same role opening or saving it later does not become the creator.
  po=store.write(po.id,{...maker,requestedBy:'Someone Else'},{action:'Edit',rev:po.rev});
  po=store.write(po.id,{...maker,requestedBy:'Someone Else'},{type:'E2',action:'Save draft',rev:po.rev,day,data:{...po.data,footerRows:JSON.stringify(po.data.footerRows),deliveries:JSON.stringify(po.data.deliveries??[])}});
  assert.equal(po.createdBy,'SIDDHARTH HOONKA');
  assert.match(detailPage({...maker,requestedBy:'Someone Else'},po,store.list('Jayant'),[]),/Created By <b>SIDDHARTH HOONKA<\/b>/);

  const sources=store.list('Jayant'), orders=sources.filter(row=>row.type==='E2'&&row.id===po.id);
  assert.equal(purchaseOrdersOnly(orders),true);
  assert.equal(purchaseOrdersOnly(sources),false);
  const [head,row]=purchaseOrderExportRows(orders,sources), cell=name=>row[head.indexOf(name)];
  assert.equal(head.length,row.length);
  assert.equal(new Set(head).size,head.length);
  assert.deepEqual(['PO No.','Indent No.','Party / Vendor Name','Lifting Location','Freight Type','Freight Rate (₹/L)','Diesel Qty (L)','Footer Head 1','Legend 1','Rate / % 1','Calculated On 1','Value (₹) 1',
    'Footer Head 2','Value (₹) 2','Footer Head 3','Value (₹) 3','Footer Head 4','Total Footer Heads','P.O. Amount','Landed Rate (per Litre)','Is Full Payment as Advance?','Created By'].map(cell),
    [po.number,indent.number.replace(/^(?!CMLL)/,''),order.supplier,'IOCL Tadali','To Pay',1.5,40000,'Basic Excise Duty','OQA',7.8,40000,312000,
    'VAT',689886.33,'Round Off',0.07,'',1001886.4,5319996,134.4999,'Yes','SIDDHARTH HOONKA'].map((value,index)=>index===1?cell('Indent No.'):value));
  assert.match(cell('Indent No.'),/IND|E1-/);
  assert.match(cell('PO Amount in Words'),/^Rupees Fifty Three Lakh/);
  assert.match(cell('Creation Date'),/^\d{2}-[A-Z][a-z]{2}-\d{4}$/);
  assert.match(cell('Creation Time'),/^\d{2}:\d{2} [AP]M$/);
});

test('a saved purchase order downloads as a PDF with every section of the form', async t => {
  const {store,order,submit}=setup(t);
  const {exciseRate,vatPercent,...base}=order;
  const po=submit('E2',{...base,supplier:'SANDEEP GASOLENES',depot:'IOCL Tadali',
    footerRows:JSON.stringify([{head:'Basic Excise Duty',legend:'OQA',rate:7.8},{head:'VAT',legend:'PRA',rate:14.9},{head:'Round Off',legend:'LSA'}])});
  const sheet=purchaseOrderSheet(po,store.list('Jayant'));
  assert.deepEqual([...sheet.sections,...sheet.closing].map(([title])=>title),['Purchase Order Details','Vendor Details','Tax & Supply','Freight & Logistics','Material Details','Tolerance & Shortage','Payment','Record Information']);
  assert.deepEqual(sheet.footer,[['Basic Excise Duty','OQA','7.8','40,000.00 L','3,12,000.00'],['VAT','PRA','14.9','46,30,109.60','6,89,886.33'],['Round Off','LSA','','','0.07']]);
  assert.deepEqual(sheet.totals[2],['P.O. Amount','53,19,996.00']);
  assert.match(Object.fromEntries(sheet.sections[1][1]).Address,/GHUGGUS ROAD, CHANDRAPUR/);
  assert.match(sheet.words,/^Rupees Fifty Three Lakh/);
  const bytes=await purchaseOrderPdf(po,store.list('Jayant'));
  assert.equal(Buffer.from(bytes.slice(0,5)).toString(),'%PDF-');
  assert.ok(bytes.length>2000);
  const maker=actor('Procurement Executive');
  assert.match(detailPage(maker,po,store.list('Jayant'),[]),new RegExp('href="/entries/record/'+po.id+'/purchase-order.pdf">⬇ Download PDF</a>'));
  // The register downloads every purchase order in one file, and any other register as a list.
  const { PDFDocument }=await import('pdf-lib');
  const both=await PDFDocument.load(await purchaseOrdersPdf([po,po],store.list('Jayant')));
  assert.equal(both.getPageCount(),2*(await PDFDocument.load(bytes)).getPageCount());
  const list=await PDFDocument.load(await registerPdf('Diesel entries',['Document','Entry','Site','Date','Status'],Array.from({length:120},(_,index)=>['E1-'+index,'Diesel indent','Jayant',day,'Posted'])));
  assert.equal(list.getPageCount(),3);
  assert.match(registerPage(maker,store.list('Jayant'),'E2'),/href="\/entries\/export\.pdf\?[^"]*">Export PDF<\/a>/);
  assert.doesNotMatch(detailPage({...maker,businessDay:day},store.fresh('E2',maker),[],[],null,store.definition('E2','Jayant')),/Download PDF/);
});

test('E4 Delivery Schedule dispatches an approved purchase order within its quantity', t => {
  const {store,submit,approve,order}=setup(t);
  assert.deepEqual([byId.E4.name,byId.E4.group,byId.E4.maker],['Delivery Schedule','Buy','Procurement Executive']);
  const waiting=submit('E2',order);
  const schedule={po:waiting.id,deliveryDate:day,deliveryLocation:'Jayant OC',deliveryAddress:'Jayant camp storage',item:review.item,litres:14000,vehicleNo:'mh34 bz 4428',transporter:'SANDEEP GASOLENES'};
  assert.throws(()=>submit('E4',schedule),/Choose a posted E2/,'the purchase order must be approved first');
  const po=approve(waiting);
  const first=submit('E4',schedule);
  assert.deepEqual([first.status,first.number,first.result.litres,first.result.vehicle,first.result.balance,first.result.order],['Posted','E4-JAY-2026-0001',14000,'MH34BZ4428',26000,po.number]);
  assert.throws(()=>submit('E4',{...schedule,vehicleNo:'TRUCK'}),/vehicle number like MH34BZ4428/);
  assert.throws(()=>submit('E4',{...schedule,deliveryDate:'2000-01-01'}),/delivery date on or after/);
  assert.throws(()=>submit('E4',{...schedule,deliveryLocation:'Nowhere'}),/Delivery location/);
  assert.throws(()=>submit('E4',{...schedule,litres:26001}),/26,000 L is left to schedule/);
  assert.equal(submit('E4',{...schedule,litres:26000,deliveryLocation:'CMPL Nagpur'}).result.balance,0);
  assert.throws(()=>submit('E4',{...schedule,litres:1}),/0 L is left to schedule/);

  const buyer={...actor('Procurement Executive'),businessDay:day};
  const form=detailPage(buyer,store.fresh('E4',buyer),store.list('Jayant'),[],null,store.definition('E4','Jayant'));
  for (const label of ['<h1>Delivery Schedule</h1>','Create a new Diesel Delivery Schedule','Dispatch Details','Location','Date','Purchase Order No.','Delivery Schedule No.','Delivery Date','Delivery Location',
    'Delivery Address','Item Name','DSL Qty (L)','Vehicle No.','Transporter','Save as Draft','Save Dispatch','✕ Cancel']) assert.ok(form.includes(label),label);
  assert.match(form,/placeholder="Generated on save" value="">/);
  assert.match(form,/name="vehicleNo"[^>]*list="dispatch-vehicles"/);
  assert.match(form,/<datalist id="dispatch-vehicles">(<option value="[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{4}">)+<\/datalist>/);
  assert.match(form,/<option value="CMPL Nagpur">CMPL Nagpur<\/option>/);
  assert.match(form,/href="\/entries\/type\/E4">✕ Cancel<\/a>/);
  // A saved schedule reads like its form: one Dispatch Details card with the same fields, not a plain two-column list.
  const saved=detailPage(buyer,first,store.list('Jayant'),[],null,store.definition('E4','Jayant'));
  assert.match(saved,/<section class="order-card order-view-card order-view-record order-dispatch"><h2>.*<span>Dispatch Details<\/span><\/h2><dl class="order-view-list">/s);
  for (const label of ['Location','Date','Purchase Order No.','Delivery Schedule No.','Delivery Date','Delivery Location','Delivery Address','Item Name','DSL Qty (L)','Vehicle No.','Transporter','Supplier'])
    assert.ok(saved.includes('<dt>'+label+'</dt>'),label);
  assert.ok(!saved.includes('Calculated and carried forward')&&!saved.includes('<h2>Entry details</h2>'));
  assert.doesNotMatch(form,new RegExp('value="'+po.id+'"'),'a fully scheduled order is no longer offered');
  assert.match(registerPage(buyer,store.list('Jayant'),'E4'),/E4-JAY-2026-0002/);
});

test('purchase orders are numbered CMLL/site/PO/financial year/001 and count up one by one', t => {
  const {store,order}=setup(t);
  const maker=actor('Procurement Executive');
  const save=()=>store.write(randomUUID(),maker,{type:'E2',action:'Submit',rev:0,day,data:{...order,litres:1000,deliveries:'',advanceAmount:undefined}}).number;
  const first=save();
  assert.match(first,/^CMLL\/CMP\/PO\/\d{2}-\d{2}\/001$/,"numbered by the location Jayant sits under");
  assert.deepEqual([save(),save()],[first.replace(/001$/,'002'),first.replace(/001$/,'003')]);
  const draft=store.write(randomUUID(),maker,{type:'E2',action:'Save draft',rev:0,day,data:{}});
  assert.equal(draft.number,'','a draft takes no number');
  assert.match(detailPage(maker,store.list('Jayant').find(row=>row.number===first),store.list('Jayant'),[]),new RegExp(first.replaceAll('/','\\/')));
});

test('an indent approved on Telegram or in Diesel can be ordered against, up to the sanctioned quantity', t => {
  const {store,order}=setup(t);
  const inCharge=actor('Site In-charge'), buyer=actor('Procurement Executive');
  const indent=store.write(randomUUID(),inCharge,{type:'E1',action:'Save indent',rev:0,day,data:{litres:900,requiredBy:0,reason:review.reasons[0],remarks:'Approved on Telegram'}});
  assert.equal(indent.status,'Saved');
  const choices=()=>sourceChoices(byId.E2.fields.find(field=>field.key==='indent'),store.fresh('E2',buyer),store.list('Jayant'),buyer).map(row=>row.id);
  assert.ok(!choices().includes(indent.id),'a saved indent waits for its approval');
  assert.equal(store.approveIndent(indent.id,{sanctioned:600,by:'Siddharth'}),true);
  assert.equal(store.approveIndent(indent.id,{sanctioned:600,by:'Siddharth'}),false,'carried over once');
  const approved=store.read(indent.id,'Jayant');
  assert.deepEqual([approved.status,approved.result.litres,approved.result.requested,approved.result.sanctioned],['Posted',600,900,600]);
  assert.ok(choices().includes(indent.id));
  const raise=litres=>store.write(randomUUID(),buyer,{type:'E2',action:'Submit',rev:0,day,data:{...order,indent:indent.id,litres,deliveries:'',advanceAmount:undefined}});
  assert.throws(()=>raise(700),/exceeds the remaining indent balance/);
  // Until an order uses it, the approved indent can be changed and sent for approval again.
  const again=store.write(indent.id,inCharge,{type:'E1',action:'Save indent',rev:approved.rev,day,data:{litres:800,requiredBy:0,reason:review.reasons[0],remarks:'Changed'}});
  assert.equal(again.status,'Saved');
  store.approveIndent(indent.id,{sanctioned:800,by:'Siddharth'});
  assert.equal(raise(800).status,'Awaiting approval');
  assert.ok(!choices().includes(indent.id),'fully ordered');
  const used=store.read(indent.id,'Jayant');
  assert.throws(()=>store.write(indent.id,inCharge,{type:'E1',action:'Save indent',rev:used.rev,day,data:{litres:900,requiredBy:0,reason:review.reasons[0],remarks:'x'}}),/purchase order already uses this indent/);
});

test('location and site are separate: indents go by site, purchase orders by the site’s location', async t => {
  const { locations, locationOf, locationName } = await import('./site-locations.mjs');
  assert.deepEqual(locations.map(location=>[location.name,location.code,location.sites.length]),[['CMPL Chandrapur','CCH',0],['CMPL Madhya Pradesh','CMP',3],['CMPL Nagpur','CNG',5]]);
  assert.deepEqual(['Jayant','Jayant OC','Dudhichua OC','Dudhichua East OC'].map(locationName),Array(4).fill('CMPL Madhya Pradesh'));
  assert.deepEqual(['Sasti','Majri OC','Dhoptala OC (2nd)','Gauri Pauni OC (2nd)','Lalpeth OC','CMPL Nagpur'].map(locationName),Array(6).fill('CMPL Nagpur'));
  assert.equal(locationName('CMPL Chandrapur'),'CMPL Chandrapur');
  assert.equal(locationOf('Somewhere new'),undefined);

  const {store,order}=setup(t);
  const buyer={...actor('Procurement Executive'),businessDay:day};
  const form=detailPage(buyer,store.fresh('E2',buyer),store.list('Jayant'),[],null,store.definition('E2','Jayant'));
  assert.match(form,/<select data-order-location><option value="">Select location<\/option><option value="CMPL Chandrapur">CMPL Chandrapur<\/option><option value="CMPL Madhya Pradesh" selected>CMPL Madhya Pradesh<\/option><option value="CMPL Nagpur">CMPL Nagpur<\/option><\/select>/);
  assert.match(form,/<select data-order-site data-role="[^"]+"><option value="">Select site<\/option><option value="Jayant" data-location="CMPL Madhya Pradesh" selected>Jayant OC<\/option><option value="Sasti" data-location="CMPL Nagpur">Sasti OC<\/option>/);
  const po=store.write(randomUUID(),buyer,{type:'E2',action:'Submit',rev:0,day,data:{...order,litres:1000,deliveries:'',advanceAmount:undefined}});
  const saved=detailPage(buyer,{...po,status:'Draft'},store.list('Jayant'),[],null,store.definition('E2','Jayant'));
  assert.match(saved,/Location<input type="text" readonly tabindex="-1"  value="CMPL Madhya Pradesh">/);
  assert.match(saved,/Site<input type="text" readonly tabindex="-1"  value="Jayant OC">/);
  const [head,row]=purchaseOrderExportRows([po],store.list('Jayant'));
  assert.deepEqual([row[head.indexOf('Location')],row[head.indexOf('Site')]],['CMPL Madhya Pradesh','Jayant']);
  const sheet=Object.fromEntries(purchaseOrderSheet(po,store.list('Jayant')).sections[0][1]);
  assert.deepEqual([sheet.Location,sheet.Site],['CMPL Madhya Pradesh','Jayant']);
});

test('E7 Goods receipt note is the merged gate entry and GRN form, and Gate entry is off the menu', async t => {
  const {store,submit,approve,order}=setup(t);
  assert.deepEqual([byId.E7.name,byId.E7.group,byId.E7.maker],['Goods receipt note','Receive','Site Store']);
  const po=approve(submit('E2',order));
  const keeper={...actor('Site Store'),businessDay:day};
  const form=detailPage(keeper,store.fresh('E7',keeper),store.list('Jayant'),[],null,store.definition('E7','Jayant'));
  for (const label of ['<h1>GRN</h1>','Gate Entry + GRN (Merged)','Site Location','Doc Type','GRN Date','GRN No.','Party Details','Party / Vendor Name','PO No.','DS No.','Reference Document','Ref Doc Type','Ref Doc No.',
    'Ref Doc Date','Transport &amp; Vehicle Details','Transporter','Vehicle No.','Vehicle Type','LR No.','LR Date','Freight Type','Freight Contract','Freight Rate','Material Details','Material Name',
    'Diesel Invoice Qty (L)','Diesel Received Qty (L)','Discrepancy Type','Diesel Rate (₹/L)','Amount (₹)','+ Add Material','Total Qty (L)','Total Amount (₹)','Storage Allocation','Storage Location',
    'Diesel Qty (L)','+ Add Allocation','Allocated Qty (L)','Diesel Inspection','Inspection No.','Inspection Date','Accepted Qty (L)','Inspector','Attachments','Unloading Slip','Invoice',
    'Save as Draft','✓ Save &amp; Generate GRN','✕ Cancel','placeholder="Generated on save"','<option>Inter Unit Transfer Order</option>','<option value="Tanker">Tanker</option>']) {
    assert.ok(form.includes(label)||form.includes(label.replace('<option>','<option value="Inter Unit Transfer Order">')),label);
  }
  assert.match(form,new RegExp('<option value="'+po.id+'">'),'an approved purchase order can be chosen');
  assert.match(form,/<option value="JCS 1">JCS 1 · JAYANT CAMP STORAGE 1<\/option>/,'storage comes from the Storage Location Master for the site');
  assert.doesNotMatch(form,/href="\/entries\/type\/E5"/);
  assert.match(form,/href="\/entries\/type\/E7"/);

  const file=name=>[{name,base64:Buffer.from('%PDF-1.4\n%%EOF').toString('base64')}];
  const grn={docType:'Purchase',supplier:'SANDEEP GASOLENES',po:po.id,transporter:'SANDEEP GASOLENES',vehicleNo:'mh34 bz 4428',vehicleType:'Tanker',freightType:'To Pay',freightRate:1.5,refDocNo:'INV-77',
    materials:JSON.stringify([{material:review.item,invoiceQty:12000,receivedQty:11950,rate:92.5}]),storage:JSON.stringify([{storage:'JCS 1',litres:7000},{storage:'JCS 2',litres:4900}]),
    acceptedQty:11900,inspector:'R. Verma',unloadingSlip:file('slip.pdf'),invoiceFile:file('invoice.pdf')};
  const save=data=>store.write(randomUUID(),keeper,{type:'E7',action:'Submit',rev:0,day,data});
  assert.throws(()=>save({...grn,acceptedQty:12000,storage:JSON.stringify([{storage:'JCS 1',litres:12000}])}),/accepted quantity cannot be more than the 11,950 L received/);
  assert.throws(()=>save({...grn,storage:JSON.stringify([{storage:'JCS 1',litres:7000}])}),/Storage rows total 7,000 L\. They must total the accepted quantity of 11,900 L/);
  assert.throws(()=>save({...grn,vehicleNo:'TANKER'}),/vehicle number like MH34BZ4428/);
  assert.throws(()=>save({...grn,invoiceFile:undefined}),/Add invoice/);
  const saved=save(grn);
  assert.deepEqual([saved.status,saved.number,saved.result.invoiceLitres,saved.result.received,saved.result.accepted,saved.result.shortage,saved.result.discrepancy,saved.result.rate,saved.result.freight,saved.result.landed,saved.result.value,saved.result.vehicle,saved.result.basis],
    ['Posted','E7-JAY-2026-0001',12000,11950,11900,100,'Shortage',92500,1500,94000,1105375,'MH34BZ4428',po.data.basis]);
  assert.deepEqual(saved.result.stockBookedTo,['JCS 1','JCS 2']);
  const { correctionTypes }=await import('./catalog.mjs');
  assert.ok(!correctionTypes.includes('E7'));
});

test('with the gate entry merged, Inspection shows as E5 and the goods receipt note as E6', t => {
  const {store}=setup(t);
  const keeper={...actor('Site Store'),businessDay:day};
  const page=registerPage(keeper,store.list('Jayant'),'E7');
  // The short menu lists no entries or codes: entries are opened from Diesel Workspace, where Inspection no longer appears.
  assert.ok(!page.includes('/entries/type/E6')&&!page.includes('<small>E6</small>'));
  assert.match(page,/<p class="heading-meta">Receive<\/p><h1>Goods receipt note<\/h1>/);
  assert.match(page,/<span>Goods receipt note<\/span><\/div>/,'the breadcrumb names the entry instead of its code');
  assert.deepEqual([byId.E2.code,byId.E6.code,byId.E7.code,byId.E8.code],['E2','E5','E6','E8']);
});

test('a saved purchase order reads in the same cards as its form', t => {
  const {store,submit,order}=setup(t);
  const po=submit('E2',{...order,supplier:'SANDEEP GASOLENES'});
  const page=detailPage(actor('Head – Procurement'),po,store.list('Jayant'),[]);
  for (const title of ['Purchase Order Details','Vendor Details','Tax &amp; Supply','Freight &amp; Logistics','Material Details','Final Calculation – Footer / Tax','Tolerance &amp; Shortage','Payment','Record Information']) {
    assert.match(page,new RegExp('<h2>'+title+'</h2>'),title);
  }
  assert.match(page,/<div><dt>Party \/ Vendor Name<\/dt><dd>SANDEEP GASOLENES<\/dd><\/div>/);
  assert.match(page,/<div><dt>Location<\/dt><dd>CMPL Madhya Pradesh<\/dd><\/div><div><dt>Site<\/dt><dd>Jayant<\/dd><\/div>/);
  assert.match(page,/<div class="grand"><span>P\.O\. Amount<\/span><output>₹ 53,19,996\.00<\/output><\/div>/);
  assert.match(page,/<span class="legend">OQA<\/span>/);
  assert.doesNotMatch(page,/<h2>Entry details<\/h2>|Calculated and carried forward/);
  assert.match(page,/value="Approve"/,'the approver still has the actions below');
});

test('landed rate is the order amount per litre plus the freight rate on To Pay and To Bill, never on FOR', t => {
  const base={litres:500,rateAfter:92.5,freightRate:1.5,footerRows:[{head:'Basic Excise Duty',legend:'OQA',rate:7.8},{head:'VAT',legend:'PRA',rate:14.9},{head:'Round Off',legend:'LSA'}]};
  const rate=basis=>purchaseOrderTotals({...base,basis});
  assert.deepEqual(['Ex-depot','To Bill','Delivered',undefined].map(basis=>rate(basis).landedRate),[116.744,116.744,115.244,115.244]);
  assert.deepEqual([rate('Ex-depot').total,rate('Delivered').total,rate('Ex-depot').dieselRate],[57622,57622,115.244],'the order amount itself does not change');
  assert.equal(purchaseOrderTotals({...base,basis:'To Bill',freightRate:''}).landedRate,115.244);

  const {submit,order,store}=setup(t);
  const po=submit('E2',{...order,basis:'To Bill',freightRate:2});
  assert.equal(po.result.landedRate,Math.round((5319996/40000+2)*10000)/10000);
  const sheet=purchaseOrderSheet(po,store.list('Jayant'));
  assert.deepEqual(sheet.totals[3],['Landed Rate (per Litre)',po.result.landedRate.toFixed(4)]);
});

test('a round off can be typed in, and payment advice details stay blank when payment is not an advance', t => {
  const rows=head=>[{head:'Basic Excise Duty',legend:'OQA',rate:7.8},head];
  const total=round=>purchaseOrderTotals({litres:500,rateAfter:92.555,footerRows:rows(round)});
  assert.deepEqual([total({head:'Round Off',legend:'LSA'}).total,total({head:'Round Off',legend:'LSA'}).roundOff],[50178,0.5],'blank still rounds to a whole rupee');
  assert.deepEqual([total({head:'Round Off',legend:'LSA',rate:'0.25'}).total,total({head:'Round Off',legend:'LSA',rate:'0.25'}).rows[1].value],[50177.75,0.25]);
  assert.deepEqual([total({head:'Round Off',legend:'LSD',rate:0.5}).total,total({head:'Round Off',legend:'LSD',rate:0.5}).rows[1].value],[50177,-0.5]);
  assert.equal(total({head:'Round Off',legend:'LSD',rate:0}).total,50177.5,'a typed zero means no rounding');

  const {submit,order,store}=setup(t);
  const {exciseRate,vatPercent,advanceAmount,...base}=order;
  const footerRows=JSON.stringify([{head:'Round Off',legend:'LSD',rate:0.6}]);
  assert.throws(()=>submit('E2',{...base,footerRows,terms:'Credit',paymentAdviceNo:'PA/1'}),/payment advice details blank/);
  const po=submit('E2',{...base,footerRows,terms:'Credit'});
  assert.deepEqual([po.result.value,po.result.roundOff],[4318109,0]);
  const buyer={...actor('Procurement Executive'),businessDay:day};
  const form=detailPage(buyer,{...po,status:'Draft'},store.list('Jayant'),[],null,store.definition('E2','Jayant'));
  assert.match(form,/<option selected>Round Off<\/option>[^]*?data-foot="rate"[^>]*value=""[^]*?data-foot="round"[^>]*placeholder="Auto" value="0.6">/);
});

test('a purchase order is approved or declined by its listed approvers, and an approved one is final', t => {
  const {store,submit,order}=setup(t);
  const maker=actor('Procurement Executive');
  const part={...order,litres:20000,advanceAmount:undefined,deliveries:''};
  let po=submit('E2',part);
  assert.equal(store.decideOrder(po.id,{status:'declined',by:'Asha Rao',reason:'Rate too high'}),true);
  po=store.read(po.id,'Jayant');
  assert.deepEqual([po.status,po.result.declinedBy],['Returned','Asha Rao']);
  assert.equal(store.decideOrder(po.id,{status:'approved',by:'Asha Rao'}),false,'a returned order waits to be saved again');
  po=store.write(po.id,maker,{type:'E2',action:'Submit',rev:po.rev,day,data:{...part,deliveries:''}});
  assert.equal(po.status,'Awaiting approval');
  assert.equal(store.decideOrder(po.id,{status:'approved',by:'Asha Rao'}),true);
  po=store.read(po.id,'Jayant');
  assert.deepEqual([po.status,po.result.approvedBy],['Posted','Asha Rao']);
  assert.throws(()=>store.write(po.id,maker,{action:'Edit',rev:po.rev}),/An approved purchase order cannot be edited/);

  // The page: an approver sees Approve and Decline; the review roles do not; the outcome shows in the heading.
  const waiting=submit('E2',{...order,litres:1000,advanceAmount:undefined,deliveries:''});
  const request={doc:waiting.id,litres:1000};
  const pending={status:'pending',label:'Awaiting approval',detail:'Sent to 1 approver on Telegram'};
  const forApprover=detailPage(actor('Head – Procurement'),{...waiting,approval:pending,decide:request},store.list('Jayant'),[]);
  assert.match(forApprover,/<h2>Approve this purchase order<\/h2>[^]*<form class="indent-decision no-quantity" method="post" action="\/po-approvals\/decide">/);
  assert.doesNotMatch(forApprover,/name="sanctioned"|value="Approve"|value="Return"|Review as /);
  assert.match(forApprover,/<span class="indent-approval is-pending"><strong>Awaiting approval<\/strong> Sent to 1 approver on Telegram<\/span>/);
  const forOthers=detailPage(actor('Head – Procurement'),{...waiting,approval:pending},store.list('Jayant'),[]);
  assert.doesNotMatch(forOthers,/Approve this purchase order|value="Approve"/);
  assert.match(detailPage(maker,{...waiting,approval:pending},store.list('Jayant'),[]),/value="Edit">Edit PO<\/button>/,'the maker may still take it back while it waits');
  const done=detailPage(maker,{...store.read(po.id,'Jayant'),approval:{status:'approved',label:'Approved',detail:'by Asha Rao · 25 Nov 2026'}},store.list('Jayant'),[]);
  assert.match(done,/· Approved<\/strong><span class="indent-approval is-approved"><strong>Approved<\/strong> by Asha Rao/);
});
