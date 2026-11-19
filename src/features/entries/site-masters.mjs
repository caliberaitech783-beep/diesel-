import { readActiveMasters } from '../masters/records.mjs';
import { byId, entries } from './catalog.mjs';
import { commercialMasters, commercialMastersFor } from './site-commercial.mjs';
import { transferOptions } from './transfer-destination.mjs';
import { entryCalendar } from './entry-calendar.mjs';
import { routeStandards } from './vehicle-route-standards.mjs';
import { allowedReceiptScenarios } from './receipt-scenarios.mjs';
import { entryReasons } from './entry-reasons.mjs';
import { operatorAccess } from './operator-authorisation.mjs';

export const siteEntryTypes = entries.map(entry=>entry.id);
const slugs = ['item-master','storage-location-master','cost-centre-vehicle-master','driver-master','reason-code-master','location-master',
  'shift-master','route-wise-diesel-master',...commercialMasters];
const ref = record => ({ id:record.id, revision:record.revision, code:record.code, name:record.name });

export function readSiteMasters(db,site) {
  const data = readActiveMasters(db,site,slugs);
  const storage = data['storage-location-master'].filter(record => ['UG tank','Bowser'].includes(record.values['Storage type'])).map(record => ({
    ...ref(record), type:record.values['Storage type'], safe:Number(record.values['Safe fill level (L)']),
    chart:record.values['Calibration chart (dip-to-litres table, UG tanks)'],
    meter:record.values['Dispenser or flow meter ID'],
    minimum:Number(record.values['Minimum level (L)']), homeTank:record.values['Home tank'],
  }));
  const vehicles = data['cost-centre-vehicle-master'].flatMap(record => {
    const v = record.values, ownership = { own:'Own', hired:'Hired', contractor:'Contractor', plant:'Plant' };
    const owner = Object.hasOwn(ownership,String(v.Ownership).trim().toLowerCase()) ? ownership[String(v.Ownership).trim().toLowerCase()] : null;
    const capacity = Number(v['Fuel tank capacity (L)']), firstReading = Number(v['Meter reading at go-live']);
    const costCentre = ['Hired','Contractor'].includes(owner) ? v['Hire party or contractor'] : record.code;
    if (!owner || !costCentre || !(capacity>0) || !Number.isFinite(firstReading) || firstReading<0) return [];
    return [{ code:v['Fleet No.'], name:v['Registration No.'], tag:v['QR or RFID tag No.'], capacity, owner, costCentre,
      firstReading, vehicleType:v['Vehicle type'], model:v['Make and model'], meterType:v['Meter type'],
      repeatHours:v['Minimum hours between fills']===undefined ? undefined : Number(v['Minimum hours between fills']) }];
  });
  const uniqueVehicles = vehicles.filter(v => vehicles.filter(candidate=>candidate.code.toLowerCase()===v.code.toLowerCase()).length===1);
  const locations=data['location-master'].map(ref);
  const location=data['location-master'].find(record=>record.site===site);
  const items=data['item-master'].map(record=>({
    ...ref(record),densityMin:Number(record.values['Density minimum (kg/m³)']),densityMax:Number(record.values['Density maximum (kg/m³)']),
    volumeBasis:record.values['Volume basis'],
  }));
  const reasons=data['reason-code-master'].map(record=>({...ref(record),
    category:record.values['Used for (rejection, shortage, variance, correction, override)'],
    evidenceRequired:String(record.values['Evidence required']).trim().toLowerCase()==='yes'}));
  return { items, storage, vehicles:uniqueVehicles, drivers:data['driver-master'].map(record=>({...ref(record),...operatorAccess(record.values)})), reasons,
    locations, calendar:entryCalendar(data['shift-master'],location),
    receiptScenarios:allowedReceiptScenarios(location?.values['Receipt scenario allowed']),
    routeStandards:routeStandards(data['route-wise-diesel-master'],site,locations), ...commercialMastersFor(data) };
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
  const unique = list => [...new Map(list.map(item=>[item.code,item])).values()];
  const lists = { tank:storage('UG tank'), bowser:storage('Bowser'), vehicle:config.vehicles, driver:config.drivers, reason:entryReasons(type,config.reasons),
    supplier:config.accounts, depot:unique(config.depots), transporter:config.accounts.filter(account=>!account.pump),
    instrument:config.instruments, pump:config.accounts.filter(account=>account.pump),
    from:config.storage,
    party:config.accounts.filter(account=>account.recovery), clearingAccount:config.accounts,
    consumptionAccount:config.accounts, gst:unique(config.gst) };
  if (type==='E15') {
    const fields = standard.fields.filter(field=>['reason','evidence'].includes(field.key)).map(field=>lists[field.key]?choices(field,lists[field.key]):field);
    return { ...standard, fields:[...config.storage.map((item,index)=>({
      key:'measured'+index, type:'number', label:item.code+' · '+item.name+(item.type==='UG tank'?' dip (cm)':' measured stock (L)'),
    })), ...fields] };
  }
  const extra = {
    E1:[{key:'evidence',label:'Reason evidence',type:'file',optional:true}],
    E3:[{key:'tds',label:'Accounts-approved deduction (₹) when no Tax Master rule applies',type:'number',optional:true}],
    E9:[{key:'gst',label:'Approved freight GST code',type:'select',optional:true},
      {key:'tds',label:'Accounts-approved deduction (₹) when no Tax Master rule applies',type:'number',optional:true}],
    E11:[{key:'routeStandard',label:'Operating route standard',type:'select',optional:true},
      {key:'loadedTrips',label:'Loaded trips since last fill',type:'number',optional:true},
      {key:'emptyTrips',label:'Empty trips since last fill',type:'number',optional:true}],
    E17:[{key:'clearingAccount',label:'Approved diesel clearing account',type:'select'},
      {key:'consumptionAccount',label:'Approved diesel consumption account',type:'select'}],
  };
  return { ...standard, receiptReasons:entryReasons('E12',config.reasons).map(row=>[row.code,row.name]), fields:[...standard.fields,...(extra[type]??[])].map(field=>{
    if (type==='E12' && field.key==='to') {
      const targets = transferOptions(config);
      const counts = new Map();
      for (const { code } of targets) counts.set(code, (counts.get(code) ?? 0) + 1);
      return { ...field, label:'Receiving site and storage', options:targets.map(target=>target.key),
        optionLabels:new Map(targets.map(target=>[target.key,target.label])),
        oldOptions:new Map(targets.filter(target=>counts.get(target.code)===1).map(target=>[target.code,target.key])) };
    }
    if (type==='E5' && field.key==='driver') return field;
    if (type==='E10A' && field.key==='bowser') return {...choices(field,lists.bowser), homeTanks:new Map(Object.entries(config.homeTanks??{}))};
    if (type==='E5' && field.key==='scenario') return {...field,options:config.receiptScenarios };
    if (type==='E2' && field.key==='depot') return choices({...field,optional:true},lists.depot);
    if (type==='E11' && field.key==='vehicle') {
      return { ...choices(field,config.vehicles), vehicleDetails:new Map(config.vehicles.map(vehicle=>[vehicle.code,vehicle])) };
    }
    if (type==='E11' && field.key==='routeStandard') {
      const optionLabels = new Map(config.routeStandards.map(rule=>[rule.id,rule.code+' · '+rule.name]));
      return { ...field, options:[...optionLabels.keys()],optionLabels };
    }
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
