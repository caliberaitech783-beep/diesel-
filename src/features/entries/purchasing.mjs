import { review, ratePerKL } from './review-masters.mjs';
import { requireValue as check, round, money, dayBefore } from './entry-rules.mjs';

export const purchasing = {
  E1(d,c) {
    const stock = round(c.balance(review.tank.label)+c.balance(review.bowser.label));
    const inTransit = Math.max(0,round(c.sum(c.posted('E2'),'litres')-c.sum(c.posted('E7'),'invoiceLitres')));
    const average = c.sum(c.posted('E11').filter(r=>r.day>=dayBefore(c.doc.day,6)),'litres')/7;
    const suggested = Math.max(0,round(review.tank.safe-stock-inTransit));
    check(d.litres>0 && d.requiredBy>=c.doc.day,'Enter positive litres and a required-by date on or after the request.');
    check(d.litres<=suggested || d.reason,'Select a reason for requesting more than suggested.');
    const approvals = ['Project Manager','Head – Procurement'];
    if (d.litres>review.indentSlab) approvals.push('Director / CMD');
    return { item:review.item, litres:d.litres, stock, inTransit, averageDaily:round(average), daysOfStock:average?round(stock/average):null, suggested,
      otherOpenIndents:c.posted('E1').filter(r=>r.result.litres>c.sum(c.reserved('E2').filter(p=>p.data.indent===r.id),'litres')).length, approvals };
  },
  E2(d,c) {
    const indent = c.linked('indent','E1'), litres=round(d.kl*1000);
    const allocated = c.sum(c.reserved('E2').filter(p=>p.data.indent===indent.id),'litres');
    check(litres>0 && litres<=round(indent.result.litres-allocated),'PO quantity exceeds the remaining indent balance.');
    check((d.type==='Retail')===(d.supplier===review.pump),'Select the supplier that matches the PO type.');
    check(d.basis!=='Ex-depot' || d.transporter,'Select the transporter for an ex-depot purchase.');
    const rate=ratePerKL(), freight=d.basis==='Ex-depot'?review.freightPerKL:0, value=money(d.kl*rate);
    const approvals=['Head – Procurement'];
    if (d.type==='Retail') approvals.push('Director / CMD'); else if (value>review.poSlab) approvals.push('CFO');
    const transitTolerance=d.tolerance??c.limits.tolerance;
    check(transitTolerance<=c.limits.tolerance,'Transit tolerance can only be lowered.');
    return { litres,rate,freight,landed:rate+freight,value,state:review.projectState[c.doc.site],shortageParty:d.basis==='Ex-depot'?d.transporter:d.supplier,transitTolerance,approvals };
  },
  E3(d,c) {
    const po=c.linked('po','E2');
    const allocated=c.sum(c.reserved('E3').filter(row=>row.data.po===po.id),'amount');
    check(d.amount>0 && d.amount<=money(po.result.value-allocated),'Amount exceeds the unpaid PO balance.');
    const yearStart=Number(c.doc.day.slice(0,4))-(c.doc.day.slice(5,7)<'04'?1:0)+'-04-01';
    const paid=c.all.filter(r=>r.type==='E3'&&r.status==='Posted'&&r.day>=yearStart&&r.day<=c.doc.day&&r.result.supplier===po.data.supplier)
      .reduce((sum,r)=>sum+r.result.amount,0);
    const taxable=Math.min(d.amount,Math.max(0,paid+d.amount-review.purchaseTdsThreshold))/(1+review.vatPercent/100);
    const tds=review.purchaseTdsEligible?money(taxable*review.purchaseTdsPercent/100):0;
    return { supplier:po.data.supplier, bank:review.bank, amount:d.amount,tds,net:money(d.amount-tds),approvals:['Head – Accounts','CFO'] };
  },
};
