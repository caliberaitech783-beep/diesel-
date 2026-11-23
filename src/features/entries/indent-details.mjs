import { siteInitials } from './entry-sites.mjs';

export function indentStatus(doc) {
  return doc.type==='E1'&&['Awaiting approval','Posted'].includes(doc.status)?'Saved':doc.status;
}

export function indentLitres(data) {
  // `litres` is the original input key. Its value is the quantity in the selected unit.
  const unit=data.unit??'Litre';
  if (!['KL','Litre'].includes(unit)) throw Error('Choose KL or Litre for Unit.');
  const litres=Number(data.litres)*(unit==='KL'?1000:1);
  if (!Number.isFinite(litres)||litres<=0||litres>1e12) throw Error('Enter a positive quantity up to 1,000,000,000,000 litres.');
  return litres;
}

export function indentFinancialYear(day) {
  const start=Number(day.slice(0,4))-(day.slice(5,7)<'04'?1:0);
  return String(start).slice(-2)+'-'+String(start+1).slice(-2);
}

export function indentSeries(doc) {
  const initials=siteInitials(doc.site);
  if (!initials) throw Error('Choose a site with valid initials.');
  const year=indentFinancialYear(doc.day);
  return {scope:initials,year,label:'cmll/'+initials+'/'+year};
}

export function requiredDays(value, day) {
  // Existing date-based indents remain readable and reviewable.
  if (typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return Math.max(0,Math.round((Date.parse(value)-Date.parse(day))/86400000));
  }
  return value;
}

export function requiredDate(day, days) {
  if (!Number.isSafeInteger(days) || days<0 || days>3650) throw Error('Enter Required by as whole days from 0 to 3650.');
  return new Date(Date.parse(day)+days*86400000).toISOString().slice(0,10);
}
