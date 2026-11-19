export function allowedReceiptScenarios(value) {
  const full = ['UG tank','Direct to bowsers'];
  const text = String(value ?? '').trim().toLowerCase().replace(/\s+/g,' ');
  if (/^(?:both(?: scenarios)?|all|(?:scenario )?1 (?:and|&|\/) (?:scenario )?2)$/.test(text)) return full;
  if (['ug tank','tt to ug tank','scenario 1','1'].includes(text)) return [full[0]];
  if (['direct to bowsers','direct to bowser','tt to bowsers','tt to bowser','scenario 2','2'].includes(text)) return [full[1]];
  return [];
}
