import { effectiveRecord } from './site-commercial.mjs';

const normalized = value => String(value ?? '').trim().normalize('NFKC').toLowerCase();

export function routeStandards(records, site, locations) {
  const locationKeys = new Set([site,...locations.map(location=>location.code)].map(normalized));
  return records.flatMap(({ id, code, values:v }) => {
    if (!locationKeys.has(normalized(v.Location))) return [];
    const perTrip = v['Standard type (per trip / per hour)'] === 'Per trip';
    const hourly = Number(v['Standard litres per hour (dumpers, excavators, dozers …)']);
    const loaded = Number(v['Diesel Required For Loaded Vehicle']);
    const empty = Number(v['Diesel Required For Empty Vehicle']);
    const tolerance = Number(v['Tolerance above standard (%)']);
    if (!Number.isFinite(tolerance) || tolerance<0 || (perTrip
      ? !Number.isFinite(loaded) || !Number.isFinite(empty) || loaded<=0 || empty<=0
      : !Number.isFinite(hourly) || hourly<=0)) return [];
    return [{ id,code:v['Entry No.']||code, name:[v.Source,v.Destination].join(' → '), model:normalized(v['Vehicle type or model']),
      from:v['Effective Date'],to:v['Effective to'],perTrip,hourly,loaded,empty,tolerance }];
  });
}

export function vehicleRouteStandard(standards, vehicle, day, selected) {
  const candidates = standards.filter(rule=>[normalized(vehicle.model),normalized(vehicle.vehicleType)].includes(rule.model));
  if (selected) return effectiveRecord(candidates,day,rule=>rule.id===selected);
  const hourly = candidates.filter(rule=>!rule.perTrip && rule.from<=day && (!rule.to||day<=rule.to));
  return hourly.length===1 ? hourly[0] : null;
}
