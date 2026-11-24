import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { openDieselDatabase } from '../../data/database.mjs';
import { createEntryStore } from './entry-store.mjs';
import { review, roleKey } from './review-masters.mjs';
import { byId } from './catalog.mjs';
import { businessDay } from './entry-rules.mjs';
import { detailPage } from './entry-page.mjs';
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
  const {rows:legacyRows,...totals}=purchaseOrderTotals({litres:40000,rateAfter:107.95274,exciseRate:7.8,vatPercent:14.9});
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
  assert.deepEqual([r.litres,r.value,r.amount,r.excise,r.vatAmount,r.roundOff,r.footerHeads,r.landedRate],[40000,5319996,4318109.6,312000,689886.33,0.07,1001886.4,132.9999]);
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
  assert.throws(()=>submit('E2',{...order,terms:'Credit'}),/Leave the advance amount blank/);
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
  for (const gone of ['Delivery Schedule','name="transporter"','>Paid<','GST Supplies<','Loading on Gross']) assert.ok(!html.includes(gone)||gone==='GST Supplies<'&&!html.includes('>GST Supplies<'),gone);
  assert.match(html,/<option value="Taxable Supplies">Taxable Supplies<\/option>/);
  assert.match(html,/<option value="Delivered">FOR<\/option><option value="Ex-depot">To Pay<\/option><option value="To Bill">To Bill<\/option>/);
  assert.match(html,/data-loading-gross checked><input type="hidden" name="loadingOnGross" value="Yes">Landing on Gross/);
  assert.match(html,/name="deliveryDate" type="date" min=/);
  assert.ok(html.indexOf('Record Information')>html.indexOf('Is Full Payment as Advance?'),'record information comes last');
  assert.match(html,/id="rail-toggle"/);
  assert.match(html,/name="undersigned"[^>]*value="Pratik Ashok Bisen · E100"/);
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

  // After approval the order can still be edited, until another entry uses it.
  po=approve(po.status==='Draft'?store.write(po.id,maker,{type:'E2',action:'Submit',rev:po.rev,day,data:order}):po);
  assert.equal(po.status,'Posted');
  assert.match(detailPage(maker,po,store.list('Jayant'),[]),/value="Edit">Edit PO<\/button>/);
  po=store.write(po.id,maker,{action:'Edit',rev:po.rev});
  assert.deepEqual([po.status,po.number],['Draft',number]);
  po=approve(store.write(po.id,maker,{type:'E2',action:'Submit',rev:po.rev,day,data:order}));
  assert.equal(po.status,'Posted');
  const using=store.write(randomUUID(),actor('Site Store'),{type:'E16',rev:0,day,action:'Save draft',data:{}});
  db.prepare('UPDATE entry_review_docs SET document=? WHERE id=?').run(JSON.stringify({...using,number:'E3-JAY-2026-0009',data:{po:po.id}}),using.id);
  assert.throws(()=>store.write(po.id,maker,{action:'Edit',rev:po.rev}),/already used by E3-JAY-2026-0009, so it cannot be edited/);
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
