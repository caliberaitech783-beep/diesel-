const key=value=>typeof value==='string'||typeof value==='number'?String(value).trim().normalize('NFKC').toLowerCase():'';

// Pulse's SSO can supply only login and its authenticated employee name.
// Prefer IDs/email; use that verified name only when Employee Master has one identity with it.
export function indentRequester(profile,employees) {
  const employeeId=key(profile?.empId??profile?.employeeId);
  const login=key(profile?.login),email=key(profile?.email);
  let matches=employees.filter(row=>employeeId?key(row.empId)===employeeId:
    (login && [row.empId,row.email].some(value=>key(value)===login)) || (email && key(row.email)===email));
  if(!employeeId && !matches.length && key(profile?.name)) matches=employees.filter(row=>key(row.name)===key(profile.name));
  const identities=new Map(matches.filter(row=>key(row.empId)&&key(row.name)).map(row=>[JSON.stringify([key(row.empId),key(row.name)]),row]));
  if (identities.size!==1) return undefined;
  const employee=identities.values().next().value;
  return {empId:String(employee.empId).trim(),name:String(employee.name).trim()};
}
