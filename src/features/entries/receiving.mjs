import { review, litresAtDip } from './review-masters.mjs';
import { requireValue as check, round } from './entry-rules.mjs';

export function gateContext(d,c) {
  const gate=c.linked('gate','E5');
  return { gate, po:c.posted('E2').find(row=>row.id===gate.data.po) };
}
export const receiving = {
  E5(d,c) {
    const po=c.linked('po','E2');
    const confirmed=c.sum(c.posted('E3').filter(r=>r.data.po===po.id),'amount');
    check((c.siteConfig && po.data.terms==='Credit')||confirmed>=po.result.value,'Treasury must confirm payment for the PO before gate entry.');
    if (po.data.basis==='Ex-depot') check(d.transporter===po.data.transporter,'Use the transporter on the PO.');
    check(/^[A-Z0-9 -]{5,16}$/i.test(d.truck) && /^\d{10}$/.test(d.mobile),'Check the registration and 10-digit driver mobile.');
    check(d.fitness>=c.doc.day && d.licence>=c.doc.day && d.invoiceDate<=c.doc.day,'Check invoice and licence validity dates.');
    const fy = day => Number(day.slice(0,4))-(day.slice(5,7)<'04'?1:0);
    check(!c.all.some(r=>r.id!==c.doc.id && r.type==='E5' && !['Draft','Returned','Superseded'].includes(r.status)
      && r.result.supplier===po.data.supplier && r.data.invoice.toLowerCase()===d.invoice.toLowerCase() && fy(r.data.invoiceDate)===fy(d.invoiceDate)),'This supplier invoice already exists in the financial year.');
    const used=c.sum(c.reserved('E5').filter(r=>r.data.po===po.id),'invoiceLitres');
    check(d.litres>0 && d.litres<=round((po.result.litres-used)*(1+po.result.transitTolerance/100)),'Invoice quantity exceeds the remaining PO balance.');
    const seals=d.seals.split(',').map(s=>s.trim());
    check(seals.every(Boolean) && new Set(seals).size===seals.length && d.sealPhotos.length>=seals.length,'Add a distinct seal number and photo for every compartment.');
    return { supplier:po.data.supplier,depot:po.result.depot??po.data.depot, invoiceLitres:d.litres, compartments:seals.length,approvals:d.intact==='No'?['Site In-charge']:[] };
  },
  E6(d,c) {
    const {gate,po}=gateContext(d,c);
    check(!c.reserved('E6').some(r=>r.data.gate===gate.id),'An inspection already exists for this tanker.');
    const reject=d.decision==='Reject', ug=gate.data.scenario==='UG tank', invoiceLitres=gate.data.litres;
    const instrument=c.siteConfig?.instruments.find(row=>row.code===d.instrument);
    check(c.siteConfig ? instrument && instrument.start<=c.doc.day && c.doc.day<=instrument.due
      && (!ug||reject||instrument.storage===d.tank) : c.doc.day<=review.calibrationDue,
    'Choose a calibrated instrument valid for this inspection and storage location.');
    const item=c.siteConfig?.item??review;
    check(reject || (d.density>=item.densityMin && d.density<=item.densityMax),'Density is outside the item range. Reject or investigate this load.');
    const partial=d.decision==='Accept part, reject part', rejected=partial ? d.rejected??0 : 0;
    check(!partial || (rejected>0 && rejected<invoiceLitres),'Enter the rejected litres, less than the invoice quantity.');
    check(partial || !d.rejected,'Rejected litres apply only to Accept part, reject part.');
    let accepted=0;
    if (ug && !reject) {
      check(d.tank && d.before!==undefined && d.after>d.before,'Select a tank and enter increasing dips.');
      const location=c.siteConfig?.storage.find(row=>row.code===d.tank);
      const opening=litresAtDip(d.before,location?.chart), safe=location?.safe??review.tank.safe;
      const acceptedLitres=round(litresAtDip(d.after,location?.chart)-opening);
      check(opening+invoiceLitres<=safe && c.balance(d.tank)+invoiceLitres<=safe,'There is insufficient safe fill space.');
      accepted=acceptedLitres;
      check(accepted+rejected<=invoiceLitres,'Measured receipt and rejected litres exceed the invoice. Recheck dips.');
    }
    // Rejected litres go back to the supplier: they are neither stock nor shortage.
    const shortage=ug || reject ? round(invoiceLitres-accepted-rejected) : 0;
    const exception=reject || partial || shortage>invoiceLitres*po.result.transitTolerance/100;
    check(!shortage || reject || partial || d.decision==='Accept with shortage','Choose Accept with shortage.');
    check(!exception || d.reason,'Select a shortage or rejection reason.');
    return { accepted,shortage,invoiceLitres,...(partial?{rejected}:{}),openingTT:!ug&&!reject?round(invoiceLitres-rejected):0,generateGRN:ug&&!reject,
      approvals:exception?['Site In-charge','Project Manager']:['Site In-charge'] };
  },
};
