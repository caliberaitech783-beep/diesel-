import { review, ratePerKL } from './review-masters.mjs';
import { money, round, requireValue as check,dayBefore } from './entry-rules.mjs';

export const accountsAndClose = {
  E8(d,c) {
    const grn=c.linked('grn','E7'), g=grn.result;
    check(!c.reserved('E8').some(r=>r.data.grn===grn.id || r.data.bill.toLowerCase()===d.bill.toLowerCase()),'Bill or GRN already matched.');
    check(d.billDate<=c.doc.day,'Check the bill date.');
    const issues=[];
    if (d.litres!==g.invoiceLitres) issues.push('Invoice litres');
    if (d.rate!==g.rate) issues.push('PO rate');
    if (d.vat!==review.vatPercent) issues.push('VAT');
    if ((d.discount??0)!==review.invoiceDiscount) issues.push('Invoice discount');
    return { passLitres:g.accepted,amount:money(g.accepted/1000*g.rate),expectedPostSaleDiscount:money(g.accepted/1000*review.postSaleDiscount),match:issues.join(', ') || 'Matched',approvals:issues.length?['Head – Accounts','CFO']:['Head – Accounts'] };
  },
  E9(d,c) {
    const grn=c.linked('grn','E7'),g=grn.result,ex=g.basis==='Ex-depot';
    check(ex||g.shortage>0,'Delivered GRNs need a shortage to raise a debit note.');
    check(!ex || (d.bill && d.billDate && d.billDate<=c.doc.day),'Enter the freight bill and a valid date.');
    check(!c.reserved('E9').some(r=>r.data.grn===grn.id || (d.bill && r.data.bill?.toLowerCase()===d.bill.toLowerCase())),'This GRN or freight bill is already settled.');
    const debit=money(g.shortage/1000*(ex?review.shortageRate:g.rate)),freight=ex?money(g.accepted/1000*g.freight):0;
    const gst=money(freight*review.freightGstPercent/100),tds=money(freight*review.freightTdsPercent/100);
    return { party:g.shortageParty,debit,freight,gst,tds,net:money(freight+(review.reverseCharge?0:gst)-tds-debit),approvals:['Head – Accounts'] };
  },
  E13(d,c) {
    check(d.fromDate<=d.toDate && d.toDate<=c.doc.day,'Choose a completed recovery period.');
    const source=[...c.posted('E11'),...c.posted('E14')].filter(r=>r.result.chargedTo===d.party && r.day>=d.fromDate && r.day<=d.toDate);
    const used=new Set(c.reserved('E13').flatMap(r=>r.result.sources));
    const remaining=source.filter(r=>!used.has(r.id));
    check(remaining.length,'No unrecovered vehicle or retail fills for this party and period.');
    const party=review.recoveryParties[d.party];
    const receipts=c.posted('E7').filter(r=>r.day>=d.fromDate&&r.day<=d.toDate);
    const received=c.sum(receipts,'accepted');
    const periodRate=received?receipts.reduce((sum,r)=>sum+r.result.accepted*r.result.landed,0)/received:c.cost(d.toDate);
    const litres=c.sum(remaining,'litres'),rate=party.basis==='Fixed rate'?party.rate:periodRate;
    return { sources:remaining.map(r=>r.id),basis:party.basis,litres,rate:round(rate),amount:money(litres/1000*rate),approvals:['Head – Accounts'] };
  },
  E16(d,c) {
    const target=c.records.find(r=>r.id===d.target && r.status==='Posted' && r.maker===c.doc.maker);
    check(target,'Only the original maker can request a correction to a posted entry.');
    const allowed={E1:['remarks','litres'],E14:['reading','rate','litres'],E11:['reading'],E8:['discount']};
    check(allowed[target.type]?.includes(d.field),'Choose a correctable field on the original entry.');
    check(!c.all.some(r=>r.site===target.site && r.type==='E17' && r.status==='Posted' && r.data.month===target.day.slice(0,7)),'The original month is locked.');
    check(!c.reserved('E16').some(r=>r.data.target===target.id),'A correction for this version already exists.');
    check(String(target.data[d.field]??'')!==d.value,'Enter a different value.');
    return { original:target.number,recorded:target.data[d.field]??'',corrected:d.value,approvals:['Site In-charge',...(['rate','litres','discount'].includes(d.field)?['Head – Accounts']:[])] };
  },
  E17(d,c) {
    const previous=dayBefore(c.doc.day.slice(0,7)+'-01').slice(0,7);
    check(d.month===previous,'Choose the previous calendar month.');
    check(!c.reserved('E17').some(r=>r.data.month===d.month),'Month close already exists.');
    const end=dayBefore(c.doc.day.slice(0,7)+'-01'),days=Number(end.slice(-2));
    const inMonth=r=>r.day.slice(0,7)===d.month;
    const counts=c.posted('E15').filter(inMonth);
    check(new Set(counts.map(r=>r.day)).size===days,'Sign every daily count before closing the month.');
    check(!c.all.some(r=>r.site===c.doc.site && inMonth(r) && !['Posted','Superseded','Returned'].includes(r.status)),'Finish outstanding entries in this month.');
    const issues=[...c.posted('E11'),...c.posted('E14')].filter(inMonth);
    const recovered=new Set(c.posted('E13').flatMap(r=>r.result.sources));
    check(issues.every(r=>r.result.owner==='Own' || recovered.has(r.id)),'Complete outstanding contractor recoveries.');
    const unbilled=c.posted('E7').filter(inMonth).filter(g=>!c.posted('E8').some(b=>b.data.grn===g.id)).length;
    check(!unbilled||d.remarks,'Add a close note for unbilled GRNs.');
    const last=counts.find(r=>r.day===end).result,litres=round(last.tankMeasured+last.bowserMeasured);
    const closeGrns=c.posted('E7').filter(r=>r.day<=end);
    const opening=review.tank.opening+review.bowser.opening;
    const rate=(opening*ratePerKL()+closeGrns.reduce((a,r)=>a+r.result.accepted*r.result.landed,0))/(opening+c.sum(closeGrns,'accepted'));
    const amount=money(litres/1000*rate);
    const consumption=Object.fromEntries([...new Set(issues.map(r=>r.result.chargedTo))].map(k=>[k,c.sum(issues.filter(r=>r.result.chargedTo===k),'litres')]));
    const journal=Object.entries(consumption).map(([costCentre,used])=>({account:costCentre,debit:money(used/1000*rate),credit:0}));
    if(journal.length) journal.push({account:'Review diesel clearing',debit:0,credit:money(journal.reduce((sum,line)=>sum+line.debit,0))});
    return { litres,rate:round(rate),closingValue:amount,unbilled,consumption,journal,approvals:['Project Manager','CFO'] };
  },
};
