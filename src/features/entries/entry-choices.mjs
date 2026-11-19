// Filter the local register for the next step. Posting still validates the balances in a transaction.
export function sourceChoices(field,doc,rows,actor) {
  const active=rows.filter(r=>r.id!==doc.id && r.site===actor.site && !['Draft','Superseded','Returned'].includes(r.status));
  const posted=active.filter(r=>r.status==='Posted' && r.day<=doc.day);
  const amount=(type,key,id,result,onlyPosted=false)=>(onlyPosted?posted:active)
    .filter(r=>r.type===type && r.data[key]===id).reduce((sum,r)=>sum+Number(r.result[result]??0),0);
  if(field.source==='correctable') return posted.filter(r=>r.maker===actor.id && ['E1','E14','E11','E8'].includes(r.type));
  return posted.filter(r=>r.type===field.source).filter(r=>{
    if(doc.type==='E2')return amount('E2','indent',r.id,'litres')<r.result.litres;
    if(doc.type==='E3')return amount('E3','po',r.id,'amount')<r.result.value;
    if(doc.type==='E5')return ((actor.siteEntryTypes && r.data.terms==='Credit')||amount('E3','po',r.id,'amount',true)>=r.result.value)
      && amount('E5','po',r.id,'invoiceLitres')<r.result.litres;
    if(doc.type==='E6')return !active.some(i=>i.type==='E6'&&i.data.gate===r.id);
    if(doc.type==='E8'||doc.type==='E9')return !active.some(b=>b.type===doc.type&&b.data.grn===r.id) && (doc.type==='E8'||r.result.shortage>0||r.result.basis==='Ex-depot');
    if(doc.type==='E10B'||doc.type==='E10C') {
      const loaded=amount('E10B','gate',r.id,'litres',true);
      return posted.some(i=>i.type==='E6'&&i.data.gate===r.id&&i.result.openingTT>0)
        && !active.some(confirm=>confirm.type==='E10C'&&confirm.data.gate===r.id)
        && (doc.type==='E10B'?loaded<r.data.litres:loaded>0);
    }
    return true;
  });
}
