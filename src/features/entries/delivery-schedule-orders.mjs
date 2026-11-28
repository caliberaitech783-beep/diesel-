import { canChooseRole } from './entry-access.mjs';
import { entrySiteDirectory } from './entry-sites.mjs';
import { locationName } from './site-locations.mjs';
import { roleKey } from './review-masters.mjs';

export const scheduleLocation = site => locationName(site) || site;
const buyer = roleKey('Procurement Executive');

export function deliveryScheduleActor(actor, site) {
  if (!canChooseRole(actor,site,buyer)) return null;
  return {...actor,site,profile:buyer,id:actor.assignments?actor.id:site+'-'+buyer};
}

export function deliveryScheduleSites(actor) {
  const sites=actor.assignments ? actor.assignments.filter(grant=>grant.profile===buyer).map(grant=>grant.site)
    : entrySiteDirectory(actor).filter(row=>row.allowed!==false).map(row=>row.site);
  return [...new Set(sites)].filter(site=>deliveryScheduleActor(actor,site));
}

export function deliveryScheduleOrders(actor, rows, {location,day,recordId,savedSite}={}) {
  const sites=new Set(deliveryScheduleSites(actor));
  return rows.filter(row=>row.type==='E2'&&row.rev>0&&sites.has(row.site)&&scheduleLocation(row.site)===location).map(po=>{
    const litres=Number(po.result?.litres??po.data?.litres??Number(po.data?.kl)*1000)||0;
    const allocated=rows.filter(row=>row.type==='E4'&&row.id!==recordId&&row.data?.po===po.id&&!['Draft','Returned','Superseded'].includes(row.status))
      .reduce((sum,row)=>sum+Number(row.result?.litres??0),0);
    const remaining=Math.max(0,Math.round((litres-allocated)*100)/100);
    const reason=po.status!=='Posted'?'This PO is '+po.status.toLowerCase()+'.':po.day>day?'This PO is dated after the schedule date.'
      :savedSite&&po.site!==savedSite?'A saved schedule must use a PO from its own site.':remaining<=0?'This PO is fully scheduled.':'';
    return {id:po.id,site:po.site,number:po.number||'Draft',day:po.day,litres,remaining,selectable:!reason,reason};
  }).sort((a,b)=>b.day.localeCompare(a.day)||a.number.localeCompare(b.number));
}

export function deliveryScheduleSelection(actor,rows,{po,location,day,recordId,savedSite,requireSelectable=true}) {
  const order=rows.find(row=>row.id===po&&row.type==='E2');
  if (!order || !deliveryScheduleActor(actor,order.site)) throw Error('Choose a purchase order from a permitted site.');
  const chosenLocation=location||scheduleLocation(order.site);
  const selected=deliveryScheduleOrders(actor,rows,{location:chosenLocation,day,recordId,savedSite}).find(row=>row.id===po);
  if (!selected) throw Error('Choose a purchase order belonging to the selected location.');
  if (savedSite&&savedSite!==order.site) throw Error('A saved schedule must use a PO from its own site.');
  if (requireSelectable&&!selected.selectable) throw Error(selected.reason);
  return deliveryScheduleActor(actor,order.site);
}
