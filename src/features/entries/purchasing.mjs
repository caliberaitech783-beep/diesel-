import { review, ratePerKL } from './review-masters.mjs';
import { requireValue as check, round, money, dayBefore } from './entry-rules.mjs';
import { effectiveRecord } from './site-commercial.mjs';
import { requiredDate, indentLitres, formatIndentNumber } from './indent-details.mjs';
import { calculatedDeduction, financialYearStart, tdsRuleFor } from './tds-deduction.mjs';

function siteOrder(data,c) {
  const config=c.siteConfig, day=c.doc.day;
  const supplier=config.accounts.find(account=>account.code===data.supplier);
  check(supplier && supplier.pump===(data.type==='Retail'),'Choose an approved supplier or pump matching the PO type.');
  const depot=data.depot || (supplier.pump ? supplier.code : undefined);
  check(depot && (supplier.pump ? depot===supplier.code : config.depots.some(row=>row.supplier===supplier.code&&row.code===depot)),
    'Choose an approved depot for this supplier.');
  const rate=effectiveRecord(config.rates,day,row=>row.supplier===supplier.code&&row.depot===depot&&row.basis===data.basis);
  check(rate?.rate>0&&rate.vat>=0&&rate.vat<=100,'Approve one effective Diesel Rate for this supplier, depot and price basis.');
  const freight=data.basis==='Ex-depot' ? effectiveRecord(config.freightRates,day,row=>row.transporter===data.transporter
    && row.depot===depot && [c.doc.site,...config.locations.map(location=>location.code)].includes(row.destination)) : null;
  if (data.basis==='Ex-depot') {
    check(config.accounts.some(account=>account.code===data.transporter&&!account.pump)
      && freight?.rate>=0 && freight.shortageRate>=0,'Approve an applicable freight rate and transporter for this site.');
  }
  return { rate:rate.rate, rateRef:rate.id, rateRevision:rate.revision, vat:rate.vat, invoiceDiscount:rate.invoiceDiscount,
    postSaleDiscount:rate.postSaleDiscount, freight:freight?.rate??0, shortageRate:freight?.shortageRate??rate.rate, depot };
}

export function approvedDeduction(amount,account,input) {
  if (!account?.tds) check(!input,'The approved account is outside the deduction workflow.');
  else check(input!==undefined && input>=0 && input<=amount,'Enter the deduction amount approved by Accounts, including zero if applicable.');
  return money(input??0);
}

// An approved Tax Master (TDS) rule works the deduction out. Without one, Accounts enters its approved amount.
export function accountDeduction(c,account,kind,base,ceiling,input) {
  const rule=account?.tds ? tdsRuleFor(c.siteConfig.tdsRules,account,kind,c.doc.day) : null;
  if (!rule) return { tds:approvedDeduction(ceiling,account,input) };
  check(input===undefined,'Leave the deduction blank. The approved Tax Master (TDS) rule works it out.');
  const [type,party,value]=kind==='purchase' ? ['E3','supplier',row=>row.result.valueBeforeVat??row.result.amount] : ['E9','party',row=>row.result.freight];
  const prior=c.all.filter(row=>row.id!==c.doc.id&&row.type===type&&row.status==='Posted'&&row.day>=financialYearStart(c.doc.day)
    &&row.day<=c.doc.day&&row.result[party]===account.code);
  const total=rows=>rows.reduce((sum,row)=>sum+value(row),0);
  const deduction=calculatedDeduction({rule,account,kind,base,priorBase:total(prior),priorUntaxed:total(prior.filter(row=>!row.result.tds))});
  check(deduction.tds<=ceiling,'The calculated deduction exceeds this payment. Review earlier untaxed bills with Accounts.');
  return deduction;
}

export const purchasing = {
  E1(d,c) {
    const storage = c.siteConfig?.storage ?? [
      {code:review.tank.label,type:'UG tank',safe:review.tank.safe},{code:review.bowser.label,type:'Bowser',safe:review.bowser.safe},
    ];
    const stock = round(storage.reduce((sum,location)=>sum+c.balance(location.code),0));
    const inTransit = Math.max(0,round(c.sum(c.posted('E2'),'litres')-c.sum(c.posted('E7'),'invoiceLitres')));
    const average = c.sum(c.posted('E11').filter(r=>r.day>=dayBefore(c.doc.day,6)),'litres')/7;
    const tankCapacity = storage.filter(location=>location.type==='UG tank').reduce((sum,location)=>sum+location.safe,0);
    const suggested = Math.max(0,round(tankCapacity-stock-inTransit));
    const litres=indentLitres(d);
    check(litres>0,'Enter a positive requested quantity.');
    const legacyDate=typeof d.requiredBy==='string' && /^\d{4}-\d{2}-\d{2}$/.test(d.requiredBy);
    if (legacyDate) check(d.requiredBy>=c.doc.day,'Choose a required-by date on or after the request.');
    const due=legacyDate?d.requiredBy:requiredDate(c.doc.day,d.requiredBy);
    check(litres<=suggested || d.reason,'Select a reason for requesting more than suggested.');
    // An indent is open while it waits for approval or still has quantity without a purchase order.
    const openIndents = c.reserved('E1').filter(r=>r.status!=='Posted'
      || r.result.litres>c.sum(c.reserved('E2').filter(p=>p.data.indent===r.id),'litres'));
    check(!openIndents.length || d.reason,'Indent '+(formatIndentNumber(openIndents[0]?.number)||'for this site')+' is still open. Select a reason to raise another.');
    const approvals = ['Project Manager','Head – Procurement'];
    if (litres>review.indentSlab) approvals.push('Director / CMD');
    const item = c.siteConfig?.item;
    return { item:item?item.code+' · '+item.name:review.item, ...(!legacyDate?{requiredDate:due}:{}), litres, stock, inTransit, averageDaily:round(average), daysOfStock:average?round(stock/average):null, suggested,
      otherOpenIndents:openIndents.length, ...(openIndents.length ? {openIndentNumbers:openIndents.map(r=>r.number).filter(Boolean).join(', ')} : {}), approvals };
  },
  E2(d,c) {
    const indent = c.linked('indent','E1'), litres=round(d.kl*1000);
    const allocated = c.sum(c.reserved('E2').filter(p=>p.data.indent===indent.id),'litres');
    check(litres>0 && litres<=round(indent.result.litres-allocated),'PO quantity exceeds the remaining indent balance.');
    check(d.basis!=='Ex-depot' || d.transporter,'Select the transporter for an ex-depot purchase.');
    if (!c.siteConfig) check((d.type==='Retail')===(d.supplier===review.pump),'Select the supplier that matches the PO type.');
    const pricing=c.siteConfig ? siteOrder(d,c) : {rate:ratePerKL(),freight:d.basis==='Ex-depot'?review.freightPerKL:0,state:review.projectState[c.doc.site]};
    const {rate,freight}=pricing, value=money(d.kl*rate);
    const approvals=['Head – Procurement'];
    if (d.type==='Retail') approvals.push('Director / CMD'); else if (value>review.poSlab) approvals.push('CFO');
    const transitTolerance=d.tolerance??c.limits.tolerance;
    check(transitTolerance<=c.limits.tolerance,'Transit tolerance can only be lowered.');
    return { litres,...pricing,landed:rate+freight,value,shortageParty:d.basis==='Ex-depot'?d.transporter:d.supplier,transitTolerance,approvals };
  },
  E3(d,c) {
    const po=c.linked('po','E2');
    const allocated=c.sum(c.reserved('E3').filter(row=>row.data.po===po.id),'amount');
    check(d.amount>0 && d.amount<=money(po.result.value-allocated),'Amount exceeds the unpaid PO balance.');
    if (c.siteConfig) {
      const supplier=c.siteConfig.accounts.find(account=>account.code===po.data.supplier);
      check(supplier?.bankVerified,'Verify the supplier bank record in the approved Account Master.');
      const valueBeforeVat=money(d.amount/(1+(po.result.vat??0)/100));
      const deduction=accountDeduction(c,supplier,'purchase',valueBeforeVat,d.amount,d.tds);
      return { supplier:supplier.code,bank:'Verified supplier account',amount:d.amount,valueBeforeVat,...deduction,net:money(d.amount-deduction.tds),
        approvals:['Head – Accounts','CFO'] };
    }
    const yearStart=Number(c.doc.day.slice(0,4))-(c.doc.day.slice(5,7)<'04'?1:0)+'-04-01';
    const paid=c.all.filter(r=>r.type==='E3'&&r.status==='Posted'&&r.day>=yearStart&&r.day<=c.doc.day&&r.result.supplier===po.data.supplier)
      .reduce((sum,r)=>sum+r.result.amount,0);
    const taxable=Math.min(d.amount,Math.max(0,paid+d.amount-review.purchaseTdsThreshold))/(1+review.vatPercent/100);
    const tds=review.purchaseTdsEligible?money(taxable*review.purchaseTdsPercent/100):0;
    return { supplier:po.data.supplier, bank:review.bank, amount:d.amount,tds,net:money(d.amount-tds),approvals:['Head – Accounts','CFO'] };
  },
};
