import { review, ratePerKL } from './review-masters.mjs';
import { money, round, requireValue as check,dayBefore } from './entry-rules.mjs';
import { approvedDeduction } from './purchasing.mjs';
import { effectiveRecord } from './site-commercial.mjs';

export const accountsAndClose = {
  E8(d,c) {
    const grn=c.linked('grn','E7'), g=grn.result;
    check(!c.reserved('E8').some(r=>r.data.grn===grn.id || r.data.bill.toLowerCase()===d.bill.toLowerCase()),'Bill or GRN already matched.');
    check(d.billDate<=c.doc.day,'Check the bill date.');
    const issues=[];
    if (d.litres!==g.invoiceLitres) issues.push('Invoice litres');
    if (d.rate!==g.rate) issues.push('PO rate');
    if (d.vat!==(g.vat??review.vatPercent)) issues.push('VAT');
    if ((d.discount??0)!==(g.invoiceDiscount??review.invoiceDiscount)) issues.push('Invoice discount');
    return { passLitres:g.accepted,amount:money(g.accepted/1000*g.rate),expectedPostSaleDiscount:money(g.accepted/1000*(g.postSaleDiscount??review.postSaleDiscount)),match:issues.join(', ') || 'Matched',approvals:issues.length?['Head – Accounts','CFO']:['Head – Accounts'] };
  },
  E9(d,c) {
    const grn=c.linked('grn','E7'),g=grn.result,ex=g.basis==='Ex-depot';
    check(ex||g.shortage>0,'Delivered GRNs need a shortage to raise a debit note.');
    check(!ex || (d.bill && d.billDate && d.billDate<=c.doc.day),'Enter the freight bill and a valid date.');
    check(!c.reserved('E9').some(r=>r.data.grn===grn.id || (d.bill && r.data.bill?.toLowerCase()===d.bill.toLowerCase())),'This GRN or freight bill is already settled.');
    const debit=money(g.shortage/1000*(ex?(g.shortageRate??review.shortageRate):g.rate)),freight=ex?money(g.accepted/1000*g.freight):0;
    if (c.siteConfig) {
      const gstRule=ex ? effectiveRecord(c.siteConfig.gst,d.billDate,row=>row.code===d.gst) : null;
      if (ex) check(gstRule && gstRule.percent>=0 && gstRule.percent<=100,'Choose an approved effective freight GST rule.');
      const transporter=c.siteConfig.accounts.find(account=>account.code===g.shortageParty);
      check(!ex||transporter,'Approve the transporter Account Master.');
      const gst=money(freight*(gstRule?.percent??0)/100), tds=approvedDeduction(freight,ex?transporter:null,d.tds);
      return {party:g.shortageParty,debit,freight,gst,tds,gstCode:gstRule?.code,reverseCharge:gstRule?.reverse??false,
        net:money(freight+(gstRule?.reverse?0:gst)-tds-debit),approvals:['Head – Accounts']};
    }
    const gst=money(freight*review.freightGstPercent/100),tds=money(freight*review.freightTdsPercent/100);
    return { party:g.shortageParty,debit,freight,gst,tds,net:money(freight+(review.reverseCharge?0:gst)-tds-debit),approvals:['Head – Accounts'] };
  },
  E13(d,c) {
    check(d.fromDate<=d.toDate && d.toDate<=c.doc.day,'Choose a completed recovery period.');
    const source=[...c.posted('E11'),...c.posted('E14')].filter(r=>r.result.chargedTo===d.party && r.day>=d.fromDate && r.day<=d.toDate);
    const used=new Set(c.reserved('E13').flatMap(r=>r.result.sources));
    const remaining=source.filter(r=>!used.has(r.id));
    check(remaining.length,'No unrecovered vehicle or retail fills for this party and period.');
    let party=review.recoveryParties[d.party];
    if (c.siteConfig) {
      const terms=c.siteConfig.accounts.find(account=>account.code===d.party)?.recovery??'';
      const fixed=/^fixed rate\s*[:=]?\s*(\d+(?:\.\d+)?)$/i.exec(terms.trim());
      party=/^weighted landed cost$/i.test(terms.trim()) ? {basis:'Weighted landed cost'}
        : fixed&&Number(fixed[1])>0 ? {basis:'Fixed rate',rate:Number(fixed[1])} : null;
      check(party,'Approve Weighted landed cost or a Fixed rate amount per KL in Account Master.');
    }
    const receipts=c.posted('E7').filter(r=>r.day>=d.fromDate&&r.day<=d.toDate);
    const received=c.sum(receipts,'accepted');
    const litres=c.sum(remaining,'litres'),rate=party.basis==='Fixed rate'?party.rate
      : received?receipts.reduce((sum,r)=>sum+r.result.accepted*r.result.landed,0)/received:c.cost(d.toDate);
    check(rate>0,'There is no approved rate for this recovery period.');
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
    const end=dayBefore(c.doc.day.slice(0,7)+'-01');
    const start=c.siteConfig?.businessDay>d.month+'-01'?c.siteConfig.businessDay:d.month+'-01';
    check(start<=end,'Opening stock starts after the requested month.');
    const days=(Date.parse(end)-Date.parse(start))/86400000+1;
    const inMonth=r=>r.day.slice(0,7)===d.month;
    const counts=c.posted('E15').filter(inMonth);
    check(new Set(counts.map(r=>r.day)).size===days,'Sign every daily count before closing the month.');
    check(!c.all.some(r=>r.site===c.doc.site && inMonth(r) && !['Posted','Superseded','Returned'].includes(r.status)),'Finish outstanding entries in this month.');
    const issues=[...c.posted('E11'),...c.posted('E14')].filter(inMonth);
    const recovered=new Set(c.posted('E13').flatMap(r=>r.result.sources));
    check(issues.every(r=>['Own','Plant'].includes(r.result.owner) || recovered.has(r.id)),'Complete outstanding contractor recoveries.');
    const unbilled=c.posted('E7').filter(inMonth).filter(g=>!c.posted('E8').some(b=>b.data.grn===g.id)).length;
    check(!unbilled||d.remarks,'Add a close note for unbilled GRNs.');
    if (c.siteConfig) {
      const completed=new Set(c.posted('E7').map(row=>row.data.gate));
      const rejected=new Set(c.posted('E6').filter(row=>row.data.decision==='Reject').map(row=>row.data.gate));
      check(c.posted('E5').filter(inMonth).every(row=>completed.has(row.id)||rejected.has(row.id)),
        'Complete each tanker receipt or record its rejection before closing.');
      check(!c.all.some(row=>row.type==='E12'&&row.result.destination===c.doc.site&&row.day<=end
        && ['In transit','Receipt review'].includes(row.status)),'Finish outstanding incoming stock transfers.');
    }
    const last=counts.find(r=>r.day===end).result,litres=round(last.measurements
      ? last.measurements.reduce((total,row)=>total+row.measured,0) : last.tankMeasured+last.bowserMeasured);
    const closeGrns=c.posted('E7').filter(r=>r.day<=end);
    const opening=review.tank.opening+review.bowser.opening;
    const rate=c.siteConfig ? c.cost(end)
      : (opening*ratePerKL()+closeGrns.reduce((a,r)=>a+r.result.accepted*r.result.landed,0))/(opening+c.sum(closeGrns,'accepted'));
    check(rate>0||(!litres&&!issues.length),'Confirm an approved stock rate before closing.');
    const amount=money(litres/1000*rate);
    const consumption=Object.fromEntries([...new Set(issues.map(r=>r.result.chargedTo))].map(k=>[k,c.sum(issues.filter(r=>r.result.chargedTo===k),'litres')]));
    if (c.siteConfig) check(d.clearingAccount!==d.consumptionAccount,'Choose separate consumption and clearing accounts.');
    const journal=Object.entries(consumption).map(([costCentre,used])=>{
      const amount=c.siteConfig ? issues.filter(row=>row.result.chargedTo===costCentre).reduce((total,row)=>
        total+(row.type==='E14'?row.result.amount:row.result.litres/1000*rate),0) : used/1000*rate;
      return {account:c.siteConfig?d.consumptionAccount:costCentre,...(c.siteConfig?{costCentre}:{}),debit:money(amount),credit:0};
    });
    if(journal.length) journal.push({account:c.siteConfig?d.clearingAccount:'Review diesel clearing',debit:0,credit:money(journal.reduce((sum,line)=>sum+line.debit,0))});
    return { litres,rate:round(rate),...(c.siteConfig?{valuationRate:rate}:{}),closingValue:amount,unbilled,consumption,journal,approvals:['Project Manager','CFO'] };
  },
};
