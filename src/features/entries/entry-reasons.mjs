const categories = {
  E1:['Override'], E6:['Shortage','Rejection'], E10A:['Variance'], E10C:['Shortage'],
  E11:['Override'], E12:['Variance'], E15:['Variance'], E16:['Correction'],
};

export function entryReasons(type, reasons) {
  return reasons.filter(reason=>categories[type]?.includes(reason.category));
}

export function reasonError(doc,reasons) {
  if (!doc.data.reason) return;
  const reason=entryReasons(doc.type,reasons).find(item=>item.code===doc.data.reason);
  if (!reason || (doc.type==='E6' && (doc.data.decision==='Reject')!==(reason.category==='Rejection'))) {
    return 'Choose an approved reason for this entry and decision.';
  }
  if (reason.evidenceRequired && !doc.data.evidence?.length) return 'Attach the evidence required by this reason code.';
}
