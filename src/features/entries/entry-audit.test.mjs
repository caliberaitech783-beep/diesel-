import assert from 'node:assert/strict';
import test from 'node:test';
import { entryCalendar, readingMoment, validateEntryShift } from './entry-calendar.mjs';
import { entryPolicy, validatePolicyMaster } from './entry-policy.mjs';
import { stockEntries } from './stock-entries.mjs';
import { accountsAndClose } from './accounts-and-close.mjs';
import { allowedReceiptScenarios } from './receipt-scenarios.mjs';
import { reasonError } from './entry-reasons.mjs';

const shift = (name,start,end,cutoff='07:30') => ({
  id:name, values:{'Shift name':name,'Start time':start,'End time':end,'Business day cut-off':cutoff},
});

test('approved site shifts handle midnight, business-day cut-off and overlap',()=>{
  const day=shift('Day','07:30','19:30'), night=shift('Night','19:30','07:30');
  assert.equal(validateEntryShift(night,[day]),undefined);
  assert.match(validateEntryShift(shift('Overlap','06:00','08:00'),[day,night]),/overlaps/);
  assert.match(validateEntryShift(shift('Different cut-off','19:30','07:30','07:00'),[day]),/same business-day/);
  const calendar=entryCalendar([day,night]);
  const early=readingMoment('2026-11-19T07:29');
  assert.equal(calendar.day(early),'2026-11-18');
  assert.equal(calendar.shift(early).name,'Night');
  const boundary=readingMoment('2026-11-19T07:30');
  assert.equal(calendar.day(boundary),'2026-11-19');
  assert.equal(calendar.shift(boundary).name,'Day');
  assert.equal(readingMoment('2026-02-30T08:00'),null);
});

test('repeat fuel overrides escalate within a week and use the approved route rates',()=>{
  const data={vehicle:'F-1',bowser:'B-1',start:60,end:90,reading:102,reason:'Repeat',routeStandard:'per-hour'};
  const previous={day:'2026-11-18',readingAt:'2026-11-19T00:30:00.000Z',data:{vehicle:'F-1',bowser:'B-1',end:60,reading:100},
    result:{repeatFill:true}};
  const standard={ id:'per-hour',code:'R-1',model:'excavator',from:'2026-01-01',perTrip:false,hourly:10,tolerance:10 };
  const context={doc:{day:'2026-11-19',readingAt:'2026-11-19T02:30:00.000Z',vehicleChecksVersion:1},
    siteConfig:{vehicles:[{code:'F-1',vehicleType:'Excavator',capacity:100,meterType:'Hour meter',owner:'Own',costCentre:'C-1'}],
      routeStandards:[standard]},posted:()=>[previous],limits:{repeatHours:6,meterJump:24}};
  const result=stockEntries.E11(data,context);
  assert.deepEqual(result.approvals,['Site In-charge','Project Manager']);
  assert.equal(result.litresPerHourLimit,11);
  assert.equal(result.efficiency,15);
  assert.equal(result.repeatFill,true);
  assert.equal(result.aboveStandard,true);
  assert.throws(()=>stockEntries.E11({...data,reason:''},context),/Select a reason/);
  assert.throws(()=>stockEntries.E11({...data,routeStandard:'missing'},context),/effective route standard/);
  context.siteConfig.routeStandards=[{...standard,perTrip:true,loaded:20,empty:8}];
  assert.throws(()=>stockEntries.E11(data,context),/trip counts/);
  assert.equal(stockEntries.E11({...data,loadedTrips:1,emptyTrips:1},context).expectedLitres,28);
});

test('retail orders keep the Director stage and Correction Request accepts Original maker policy',()=>{
  const effective='2026-11-01';
  const rule = {Entry:'E2','Applies to (all / bulk PO / retail PO)':'All','Quantity or value slab':'All',
    'Initiator role':'Procurement Executive','Approver level 1 role':'Head of Procurement','Effective from':effective};
  const retail={...rule,'Applies to (all / bulk PO / retail PO)':'Retail PO'};
  assert.match(validatePolicyMaster('approval-limit-master',retail),/Director/);
  const correction={...rule,Entry:'E16','Initiator role':'Original maker','Approver level 1 role':'Site In-charge'};
  assert.equal(validatePolicyMaster('approval-limit-master',correction),undefined);
  const policy=entryPolicy({'approval-limit-master':[{site:'Mine',values:rule}]},'Mine',effective);
  const result={ approvals:['Head – Procurement','Director / CMD'],value:100 };
  assert.deepEqual(policy.approvals({type:'E2',data:{type:'Retail'}},result).approvals,result.approvals);
});

test('site receipt options and exception evidence follow the approved masters',()=>{
  assert.deepEqual(allowedReceiptScenarios('Scenario 2'),['Direct to bowsers']);
  assert.deepEqual(allowedReceiptScenarios('Both'),['UG tank','Direct to bowsers']);
  assert.deepEqual(allowedReceiptScenarios('unconfigured'),[]);
  const reasons=[{code:'SH',category:'Shortage',evidenceRequired:false},
    {code:'RJ',category:'Rejection',evidenceRequired:true}];
  const doc={type:'E6',data:{decision:'Reject',reason:'SH'}};
  assert.match(reasonError(doc,reasons),/approved reason/);
  doc.data.reason='RJ';
  assert.match(reasonError(doc,reasons),/required/);
  doc.data.evidence=[{id:'photo'}];
  assert.equal(reasonError(doc,reasons),undefined);
});

test('bill match uses dispatch-date masters and identifies duplicates by supplier and financial year',()=>{
  const grn={id:'grn',data:{gate:'gate',po:'po'},result:{supplier:'SUP',basis:'Delivered',invoiceLitres:2000,accepted:1800,rate:90000}};
  const gate={id:'gate',data:{invoiceDate:'2026-04-01'},result:{depot:'DEP'}};
  const base={supplier:'SUP',depot:'DEP',basis:'Delivered',vat:0,invoiceDiscount:0,postSaleDiscount:100};
  const context={doc:{id:'bill',day:'2026-05-01',billChecksVersion:1},all:[],linked:()=>grn,
    posted:type=>type==='E5'?[gate]:[{id:'po'}],siteConfig:{rates:[
      {...base,id:'prior',rate:90000,from:'2025-01-01',to:'2026-03-31'},
      {...base,id:'dispatch',revision:2,rate:100000,from:'2026-04-01',to:'2026-04-30'},
      {...base,id:'current',rate:110000,from:'2026-05-01'},
    ]}};
  const values={bill:'N-400',billDate:'2026-05-01',litres:2000,rate:100000,vat:0};
  const result=accountsAndClose.E8(values,context);
  assert.equal(result.amount,180000);
  assert.equal(result.rateRef,'dispatch');
  assert.equal(result.expectedPostSaleDiscount,180);
  const older={id:'old',type:'E8',status:'Posted',site:'Another Site',data:{grn:'other',bill:'n-400',billDate:'2026-04-03'},
    result:{supplier:'OTHER'}};
  context.all=[older];
  assert.equal(accountsAndClose.E8(values,context).match,'Matched');
  older.result.supplier='SUP';
  assert.throws(()=>accountsAndClose.E8(values,context),/already matched in the financial year/);
  older.data.billDate='2026-03-31';
  assert.deepEqual(accountsAndClose.E8({...values,rate:90000},context).approvals,['Head – Accounts','CFO']);
});
