const key=value=>typeof value==='string'||typeof value==='number'?String(value).trim().normalize('NFKC').toLowerCase():'';

// Resolve only identifiers from the verified Pulse account. Names alone cannot link accounts.
export function indentRequester(profile,employees) {
  const employeeId=key(profile?.empId??profile?.employeeId);
  const login=key(profile?.login),email=key(profile?.email);
  const matches=employees.filter(row=>employeeId?key(row.empId)===employeeId:
    (login && [row.empId,row.email].some(value=>key(value)===login)) || (email && key(row.email)===email));
  const identities=new Map(matches.filter(row=>key(row.empId)&&key(row.name)).map(row=>[JSON.stringify([key(row.empId),key(row.name)]),row]));
  if (identities.size!==1) return undefined;
  const employee=identities.values().next().value;
  return {empId:String(employee.empId).trim(),name:String(employee.name).trim()};
}
