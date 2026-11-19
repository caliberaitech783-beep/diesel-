import { requireValue as check } from './entry-rules.mjs';

export function siteAverageRate(config, documents, site, day) {
  const lastClose = documents.filter(row=>row.type==='E17'&&row.status==='Posted'&&row.site===site&&row.data.month<day.slice(0,7))
    .sort((a,b)=>b.data.month.localeCompare(a.data.month))[0];
  const opening = lastClose?.result.litres ?? config.storage.reduce((total,row)=>total+row.opening,0);
  const rate = lastClose?.result.valuationRate ?? lastClose?.result.rate ?? config.openingRate;
  check(opening===0||rate>0,'Confirm the Accounts-approved opening rate before valuing stock.');
  const afterClose = date => date<=day && (lastClose ? date.slice(0,7)>lastClose.data.month : date>=config.businessDay);
  const sources = documents.filter(row=>row.status==='Posted').flatMap(row=>{
    if (row.type==='E7'&&row.site===site&&afterClose(row.day)) return [[row.result.accepted,row.result.landed]];
    if (row.type==='E12'&&row.result.destination===site&&row.result.receiptDay&&afterClose(row.result.receiptDay)) {
      return [[row.result.received,row.result.transferRate]];
    }
    return [];
  });
  check(sources.every(([litres,value])=>litres>=0&&value>0),'An incoming transfer or receipt is missing its approved stock rate.');
  const quantity=opening+sources.reduce((total,[litres])=>total+litres,0);
  return quantity ? (opening*(rate??0)+sources.reduce((total,[litres,value])=>total+litres*value,0))/quantity : 0;
}
