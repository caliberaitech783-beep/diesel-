import { readActiveMasters } from '../masters/records.mjs';
import { byId } from './catalog.mjs';

export const siteEntryTypes = ['E1','E10A','E11','E15'];
const slugs = ['item-master','storage-location-master','cost-centre-vehicle-master','driver-master','reason-code-master'];
const ref = record => ({ id:record.id, revision:record.revision, code:record.code, name:record.name });

export function readSiteMasters(db,site) {
  const data = readActiveMasters(db,site,slugs);
  const storage = data['storage-location-master'].filter(record => ['UG tank','Bowser'].includes(record.values['Storage type'])).map(record => ({
    ...ref(record), type:record.values['Storage type'], safe:Number(record.values['Safe fill level (L)']),
    chart:record.values['Calibration chart (dip-to-litres table, UG tanks)'],
    meter:record.values['Dispenser or flow meter ID'],
  }));
  const vehicles = data['cost-centre-vehicle-master'].flatMap(record => {
    const v = record.values, ownership = { own:'Own', hired:'Hired', contractor:'Contractor', plant:'Plant' };
    const owner = Object.hasOwn(ownership,String(v.Ownership).trim().toLowerCase()) ? ownership[String(v.Ownership).trim().toLowerCase()] : null;
    const capacity = Number(v['Fuel tank capacity (L)']), firstReading = Number(v['Meter reading at go-live']);
    const costCentre = ['Hired','Contractor'].includes(owner) ? v['Hire party or contractor'] : record.code;
    if (!owner || !costCentre || !(capacity>0) || !Number.isFinite(firstReading) || firstReading<0) return [];
    return [{ code:v['Fleet No.'], name:v['Registration No.'], tag:v['QR or RFID tag No.'], capacity, owner, costCentre,
      firstReading, meterType:v['Meter type'], repeatHours:v['Minimum hours between fills']===undefined ? undefined : Number(v['Minimum hours between fills']) }];
  });
  const uniqueVehicles = vehicles.filter(v => vehicles.filter(candidate=>candidate.code.toLowerCase()===v.code.toLowerCase()).length===1);
  return { items:data['item-master'].map(ref), storage, vehicles:uniqueVehicles, drivers:data['driver-master'].map(ref), reasons:data['reason-code-master'].map(ref) };
}

export function siteDefinition(type, config) {
  const standard = byId[type];
  if (!config || !siteEntryTypes.includes(type)) return standard;
  const storage = name => config.storage.filter(item=>item.type===name);
  function choices(field,list) {
    return { ...field, options:list.map(item=>item.code),
      optionLabels:new Map(list.map(item=>[item.code,item.code+' · '+item.name])),
      optionTags:new Map(list.filter(item=>item.tag||item.meter).map(item=>[item.code,item.tag||item.meter])) };
  }
  const lists = { tank:storage('UG tank'), bowser:storage('Bowser'), vehicle:config.vehicles, driver:config.drivers, reason:config.reasons };
  if (type==='E15') {
    const fields = standard.fields.filter(field=>['reason','evidence'].includes(field.key)).map(field=>lists[field.key]?choices(field,lists[field.key]):field);
    return { ...standard, fields:[...config.storage.map((item,index)=>({
      key:'measured'+index, type:'number', label:item.code+' · '+item.name+(item.type==='UG tank'?' dip (cm)':' measured stock (L)'),
    })), ...fields] };
  }
  return { ...standard, fields:standard.fields.map(field=>{
    const adjusted = field.key==='reading'?{...field,label:'Vehicle meter reading'}:field;
    return lists[field.key]?choices(adjusted,lists[field.key]):adjusted;
  }) };
}

export function parseDipChart(text, max) {
  const rows = String(text ?? '').trim().split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
  if (/^cm[,;\t]litres$/i.test(rows[0] ?? '')) rows.shift();
  const pairs = rows.map(row=>row.split(/[,;\t]/).map(value=>value.trim()));
  if (pairs.length<2 || pairs.some(pair=>pair.length!==2||pair.some(value=>!/^\d+(?:\.\d+)?$/.test(value)))) return null;
  const chart = pairs.map(pair=>pair.map(Number));
  return chart.every(([dip,litres],index)=>Number.isFinite(dip)&&Number.isFinite(litres)
    && (index===0 || (dip>chart[index-1][0]&&litres>chart[index-1][1]))) && chart.at(-1)[1]>=max ? chart : null;
}
