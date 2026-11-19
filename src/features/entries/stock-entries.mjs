import { review, litresAtDip } from './review-masters.mjs';
import { requireValue as check, round, money, dayBefore } from './entry-rules.mjs';
import { gateContext } from './receiving.mjs';
import { transferTarget } from './transfer-destination.mjs';
import { checkOperator } from './operator-authorisation.mjs';
import { vehicleRouteStandard } from './vehicle-route-standards.mjs';

function meter(d) {
  check(d.end>d.start,'Meter end must be higher than the start.');
  return round(d.end-d.start);
}
function openTanker(d,c) {
  const {gate}=gateContext(d,c);
  const inspection=c.posted('E6').find(r=>r.data.gate===gate.id && r.result.openingTT>0);
  check(inspection,'Select a tanker cleared for direct-to-bowser unloading.');
  check(!c.reserved('E10C').some(r=>r.data.gate===gate.id),'This tanker already has an empty confirmation.');
  const loads=c.posted('E10B').filter(r=>r.data.gate===gate.id);
  return { gate,loads,loaded:c.sum(loads,'litres') };
}
export const stockEntries = {
  E10A(d,c) {
    checkOperator(c,d.bowser);
    const chart=c.siteConfig?.storage.find(row=>row.code===d.tank)?.chart;
    const litres=meter(d), out=round(litresAtDip(d.before,chart)-litresAtDip(d.after,chart));
    check(out>0,'Tank dip must fall during a transfer.');
    const difference=round(Math.abs(out-litres)/litres*100), exception=difference>c.limits.bowserLimit;
    check(!exception||d.reason,'Select a reason for the transfer difference.');
    return { out,litres,difference,approvals:exception?['Site In-charge']:[],moves:[{storage:d.tank,litres:-out},{storage:d.bowser,litres}] };
  },
  E10B(d,c) {
    checkOperator(c,d.bowser);
    const {gate,loaded}=openTanker(d,c), litres=meter(d);
    const before=round(gate.data.litres-loaded);
    check(litres<=before,'Load exceeds tanker balance.');
    return { litres,before,after:round(before-litres),approvals:[],moves:[{storage:d.bowser,litres}] };
  },
  E10C(d,c) {
    const {gate,loads,loaded}=openTanker(d,c);
    check(loads.length && d.evidence.length>=gate.result.compartments,'Record the bowser loads and add one empty photo per compartment.');
    return { accepted:loaded,invoiceLitres:gate.data.litres,shortage:round(gate.data.litres-loaded),loads:loads.length,
      bowsers:new Set(loads.map(r=>r.data.bowser)).size,generateGRN:true,approvals:['Site In-charge'] };
  },
  E11(d,c) {
    checkOperator(c,d.bowser);
    const litres=meter(d), vehicle=c.siteConfig ? c.siteConfig.vehicles.find(row=>row.code===d.vehicle) : review.vehicles[d.vehicle];
    check(vehicle,'Choose an approved vehicle for this site.');
    const issues=c.posted('E11'), lastMeter=issues.find(r=>r.data.bowser===d.bowser);
    if (lastMeter) check(d.start===lastMeter.data.end,'Start from the last issue meter end for this bowser.');
    const last=issues.find(r=>r.data.vehicle===d.vehicle);
    check(litres<=vehicle.capacity,'Issued litres exceed the vehicle tank capacity.');
    check(last || d.reading>=(vehicle.firstReading??0),'Reading cannot be below the approved go-live reading.');
    check(!last || d.reading>=last.data.reading,'Vehicle meter cannot go backwards.');
    const delta=last?d.reading-last.data.reading:0;
    const currentAt = c.doc.readingAt ?? c.doc.created;
    const hours=last?(Date.parse(currentAt)-Date.parse(last.readingAt??last.created))/3600000:null;
    const efficiency=delta>0?round(litres/delta):null;
    const meterJump=vehicle.meterType!=='Kilometre meter' && delta>c.limits.meterJump*Math.max(1,Math.ceil(hours/24));
    const repeatFill=Boolean(last && hours<(vehicle.repeatHours??c.limits.repeatHours));
    let efficiencyLimit = vehicle.standard;
    let standardDetails = {};
    if (c.siteConfig && c.doc.vehicleChecksVersion) {
      if (last?.readingAt && c.doc.readingAt) check(hours>=0,'This fill is earlier than the vehicle’s last recorded fill.');
      const standard=vehicleRouteStandard(c.siteConfig.routeStandards,vehicle,c.doc.day,d.routeStandard);
      check(!d.routeStandard || standard,'Choose an effective route standard for this vehicle type or model.');
      if (standard?.perTrip) {
        check(Number.isSafeInteger(d.loadedTrips??0) && Number.isSafeInteger(d.emptyTrips??0)
          && (d.loadedTrips??0)+(d.emptyTrips??0)>0,'Enter the loaded and empty trip counts for this route.');
        const expected = (d.loadedTrips??0)*standard.loaded+(d.emptyTrips??0)*standard.empty;
        standardDetails = { routeStandard:standard.code, expectedLitres:round(expected),
          aboveStandard:litres>expected*(1+standard.tolerance/100) };
      } else if (standard && vehicle.meterType==='Hour meter') {
        efficiencyLimit = standard.hourly*(1+standard.tolerance/100);
        standardDetails = { routeStandard:standard.code, litresPerHourLimit:round(efficiencyLimit) };
      }
    }
    const aboveStandard=standardDetails.aboveStandard ?? (efficiency!==null && efficiency>efficiencyLimit);
    const exception=(last && (repeatFill || meterJump || aboveStandard)) || standardDetails.aboveStandard;
    check(!exception || d.reason,'Select a reason for a repeat fill or meter override.');
    const approvals=exception?['Site In-charge']:[];
    if (c.doc.vehicleChecksVersion && repeatFill && issues.some(issue=>issue.data.vehicle===d.vehicle&&issue.result.repeatFill
      && issue.day>=dayBefore(c.doc.day,6))) approvals.push('Project Manager');
    return { litres,efficiency,owner:vehicle.owner,chargedTo:vehicle.costCentre,approvals,moves:[{storage:d.bowser,litres:-litres}],
      ...(c.doc.vehicleChecksVersion ? {...standardDetails,repeatFill,meterJump,aboveStandard} : {}) };
  },
  E12(d,c) {
    check(d.sent>0,'Enter dispatched litres.');
    const destination=c.siteConfig && transferTarget(c.siteConfig,d.to,c.doc.result?.destination);
    if (c.siteConfig) {
      check(destination && destination.businessDay<=c.doc.day,
        'Choose receiving storage with approved opening stock for the same diesel item.');
    }
    const valuation=c.siteConfig ? { transferRate:round(c.cost()) } : {};
    return { sent:d.sent,destination:destination?.site??c.other,...valuation,approvals:['Site In-charge'],moves:[{storage:d.from,litres:-d.sent}] };
  },
  E14(d,c) {
    const vehicle=c.siteConfig ? c.siteConfig.vehicles.find(row=>row.code===d.vehicle) : review.vehicles[d.vehicle];
    check(vehicle,'Choose an approved vehicle for this site.');
    check(d.litres>0 && d.rate>0 && d.litres<=vehicle.capacity,'Check the slip rate, litres and vehicle capacity.');
    check(d.slipDate<=c.doc.day,'Slip date is in the future.');
    check(!c.all.some(r=>r.type==='E14' && r.id!==c.doc.id && !['Draft','Returned','Superseded'].includes(r.status) && r.data.pump===d.pump && r.data.slip.toLowerCase()===d.slip.toLowerCase()),'This pump slip is already recorded.');
    check(c.posted('E14').filter(r=>r.data.vehicle===d.vehicle).every(r=>d.reading>=r.data.reading),'Kilometre reading cannot go backwards.');
    const amount=money(d.litres*d.rate);
    check(amount===d.total,'Slip amount must equal litres × rate.');
    return { litres:d.litres,amount,owner:vehicle.owner,chargedTo:vehicle.costCentre,approvals:['Site In-charge'] };
  },
  E15(d,c) {
    check(!c.reserved('E15').some(r=>r.day===c.doc.day),'A count already exists for this business day.');
    if (c.siteConfig) {
      const measurements = c.siteConfig.storage.map((location,index)=>{
        const book=c.balance(location.code);
        const measured=location.type==='UG tank' ? litresAtDip(d['measured'+index],location.chart) : d['measured'+index];
        check(measured<=location.safe,'Measured stock exceeds safe fill for '+location.code+'.');
        return { code:location.code, book, measured, variance:round(book-measured) };
      });
      const issue=c.sum(c.posted('E11').filter(row=>row.day===c.doc.day),'litres');
      const largest=Math.max(...measurements.map(row=>Math.abs(row.variance)));
      const variancePercent=issue?round(largest/issue*100):null;
      const exception=issue?variancePercent>c.limits.countLimit:largest>0;
      check(!exception || (d.reason && d.evidence?.length),'Give a variance reason and attach evidence.');
      const moves=measurements.filter(row=>row.variance).map(row=>({storage:row.code,litres:-row.variance}));
      return { measurements,variancePercent,moves,approvals:exception?['Site In-charge','Project Manager']:['Site In-charge'] };
    }
    const tankBook=c.balance(review.tank.label),bowserBook=c.balance(review.bowser.label);
    const measured=litresAtDip(d.dip);
    check(d.bowserCount<=review.bowser.capacity,'Bowser measurement exceeds capacity.');
    const tankVariance=round(tankBook-measured),bowserVariance=round(bowserBook-d.bowserCount);
    const issue=c.sum(c.posted('E11').filter(r=>r.day===c.doc.day),'litres');
    const largest=Math.max(Math.abs(tankVariance),Math.abs(bowserVariance));
    const variancePercent=issue?round(largest/issue*100):null;
    const exception=issue?variancePercent>c.limits.countLimit:largest>0;
    check(!exception || (d.reason && d.evidence?.length),'Give a variance reason and attach evidence.');
    return { tankBook,bowserBook,tankMeasured:measured,bowserMeasured:d.bowserCount,tankVariance,bowserVariance,
      variancePercent,approvals:exception?['Site In-charge','Project Manager']:['Site In-charge'] };
  },
};
