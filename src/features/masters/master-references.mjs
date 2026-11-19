// Fields that must name an approved record of another master, so Entry can follow the link without spelling differences.
const account = { master:'account-master', title:'Account Master', choice:record=>[record.code,record.name+' · '+record.code] };
const carrier = { ...account, accept:record=>record.values['Is Market Petrol Pump']!=='Yes' };
const depot = { master:'supplier-depot-master', title:'Supplier Depot Master',
  choice:record=>[record.values['Depot name'],record.values['Depot name']+' · '+record.values['Supplier (A/C Code)']] };
const location = { master:'location-master', title:'Location Master', choice:record=>[record.code,record.name+' · '+record.code] };
const storage = { master:'storage-location-master', title:'Storage Location Master', choice:record=>[record.code,record.name+' · '+record.code],
  accept:record=>['UG tank','Bowser'].includes(record.values['Storage type']) };
const tank = { ...storage, accept:record=>record.values['Storage type']==='UG tank' };

export const masterReferences = {
  'supplier-depot-master': { 'Supplier (A/C Code)':account },
  'diesel-rate-master': { Supplier:account, Depot:depot },
  'transport-freight-master': { Transporter:carrier, 'From depot':depot, 'To site':location },
  'measuring-instrument-master': { 'Fitted on (tank, bowser)':storage },
  'cost-centre-vehicle-master': { 'Hire party or contractor':account },
  'storage-location-master': { 'Home tank':tank },
};

export const referencedMasters = slug => [...new Set(Object.values(masterReferences[slug] ?? {}).map(source=>source.master))];

// approved: the result of readActiveMasters for referencedMasters(slug) at the record's site.
export function referenceChoices(slug, approved) {
  return new Map(Object.entries(masterReferences[slug] ?? {}).map(([field,source]) => [field,
    new Map(approved[source.master].filter(record=>!source.accept||source.accept(record)).map(source.choice).filter(([code])=>code))]));
}

// A value carried over unchanged from the saved record stays, so older records can still be edited.
export function referenceProblem(slug, approved, values, saved = {}) {
  const choices = referenceChoices(slug, approved);
  for (const [field,source] of Object.entries(masterReferences[slug] ?? {})) {
    const value = values[field];
    if (value && value!==saved[field] && !choices.get(field).has(value)) return 'Choose an approved '+source.title+' record for '+field+'.';
  }
  if (slug==='diesel-rate-master' && values.Depot && (values.Depot!==saved.Depot || values.Supplier!==saved.Supplier)
    && !approved['supplier-depot-master'].some(record=>record.values['Depot name']===values.Depot && record.values['Supplier (A/C Code)']===values.Supplier)) {
    return 'Choose a depot approved for this supplier in the Supplier Depot Master.';
  }
}
