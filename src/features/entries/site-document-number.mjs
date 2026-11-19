import { byId } from './catalog.mjs';
import { requireValue as check } from './entry-rules.mjs';

export function siteDocumentSeries(doc,config) {
  const year=Number(doc.day.slice(0,4))-(doc.day.slice(5,7)<'04'?1:0);
  const financialYear=year+'-'+String(year+1).slice(-2);
  const names=[doc.type.toLowerCase(),byId[doc.type].name.toLowerCase()];
  const matches=config.numbering.filter(row=>names.includes(row.entry.trim().toLowerCase())&&row.financialYear===financialYear);
  const series=matches.length===1?matches[0]:null;
  check(series&&series.next>=1&&Number.isSafeInteger(series.next)&&/^[A-Za-z0-9][A-Za-z0-9/.-]{0,31}$/.test(series.prefix),
    'Approve a single Document Numbering Master series for '+doc.type+' and '+financialYear+'.');
  const code=config.locations[0]?.code;
  check(!series.siteWise||code,'Approve a Location Master code for the site-wise series.');
  return { scope:series.siteWise?doc.site:'', year:financialYear, next:series.next,
    label:[series.prefix,...(series.siteWise?[code]:[]),financialYear].join('/') };
}
