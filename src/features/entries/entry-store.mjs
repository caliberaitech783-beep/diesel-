import { randomUUID } from 'node:crypto';
import { byId } from './catalog.mjs';
import { businessDay,evaluate,validateFields,validDate,requireValue as check,round,money } from './entry-rules.mjs';
import { entryRole, review, roleKey } from './review-masters.mjs';
import { mayApproveEntry } from './approval-roles.mjs';
import { entryPolicy } from './entry-policy.mjs';
import { siteDefinition, siteEntryTypes } from './site-masters.mjs';
import { siteDocumentSeries } from './site-document-number.mjs';
import { transferTarget } from './transfer-destination.mjs';
import { readingMoment } from './entry-calendar.mjs';
import { entryReasons, reasonError } from './entry-reasons.mjs';

const unpack = row => row && JSON.parse(row.document);
const finalStates = ['Posted','Superseded'];
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const visible = (doc,site) => doc.site===site || (doc.type==='E12' && doc.result.destination===site && !['Draft','Returned'].includes(doc.status));
export function createEntryStore(db, { policyFor = (_, day) => entryPolicy(undefined, undefined, day), siteFor, calendarFor } = {}) {
  db.exec(`CREATE TABLE IF NOT EXISTS entry_review_docs(id TEXT PRIMARY KEY,document TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS entry_review_requests(token TEXT PRIMARY KEY,doc TEXT,actor TEXT);
    CREATE TABLE IF NOT EXISTS entry_review_history(seq INTEGER PRIMARY KEY,doc TEXT,actor TEXT,action TEXT,stamp TEXT,snapshot TEXT);
    CREATE TABLE IF NOT EXISTS entry_review_moves(seq INTEGER PRIMARY KEY,doc TEXT,site TEXT,day TEXT,storage TEXT,litres REAL);
    CREATE TABLE IF NOT EXISTS entry_review_numbers(site TEXT,type TEXT,year TEXT,n INTEGER,PRIMARY KEY(site,type,year));
    CREATE TABLE IF NOT EXISTS entry_review_files(id TEXT PRIMARY KEY,doc TEXT,name TEXT,mime TEXT,bytes BLOB);`);
  const all = () => db.prepare('SELECT document FROM entry_review_docs ORDER BY rowid DESC').all().map(unpack);
  const moves = () => db.prepare('SELECT * FROM entry_review_moves ORDER BY seq').all();
  const get = id => unpack(db.prepare('SELECT document FROM entry_review_docs WHERE id=?').get(id));
  const dayFor = (site, now = new Date()) => calendarFor?.(site).day(now) ?? businessDay(now);
  function siteConfig(type,site,day) {
    if (!siteFor) return undefined;
    check(siteEntryTypes.includes(type),'This entry type is unavailable in the site stock workspace.');
    const config=siteFor(site);
    check(config,'Approve opening stock for this site before entering transactions.');
    if(day) check(day>=config.businessDay,'Choose a business date on or after the opening stock date.');
    return config;
  }
  function definition(type,site) {
    return siteDefinition(type,siteConfig(type,site));
  }
  function read(id,site) {
    const doc=get(id);
    check(doc && visible(doc,site),'Entry unavailable for this site.');
    return doc;
  }
  function persist(doc,actor,action) {
    doc.rev++; doc.updated=new Date().toISOString();
    const json=JSON.stringify(doc);
    db.prepare('INSERT INTO entry_review_docs VALUES(?,?) ON CONFLICT(id) DO UPDATE SET document=excluded.document').run(doc.id,json);
    db.prepare('INSERT INTO entry_review_history(doc,actor,action,stamp,snapshot) VALUES(?,?,?,?,?)').run(doc.id,actor,action,doc.updated,json);
  }
  function assignNumber(doc) {
    if (doc.number) return;
    if (siteFor) {
      const series=siteDocumentSeries(doc,siteConfig(doc.type,doc.site,doc.day));
      const {n}=db.prepare('INSERT INTO entry_review_numbers VALUES(?,?,?,?) ON CONFLICT(site,type,year) DO UPDATE SET n=MAX(n+1,excluded.n) RETURNING n')
        .get(series.scope,doc.type,series.year,series.next);
      const number=series.label+'/'+String(n).padStart(4,'0');
      check(!all().some(row=>row.number===number),'This document number already exists. Review the approved prefix and series.');
      doc.number=number;
      return;
    }
    const year=doc.day.slice(0,4);
    const {n}=db.prepare('INSERT INTO entry_review_numbers VALUES(?,?,?,1) ON CONFLICT(site,type,year) DO UPDATE SET n=n+1 RETURNING n').get(doc.site,doc.type,year);
    doc.number=[doc.type,doc.site.slice(0,3).toUpperCase(),year,String(n).padStart(4,'0')].join('-');
  }
  function closed(site,day) {
    return all().some(r=>r.type==='E17' && r.site===site && r.status==='Posted' && r.data.month===day.slice(0,7));
  }
  function checkLocks(doc) {
    check(!closed(doc.site,doc.day),'This month is locked.');
    if (['E5','E6','E10A','E10B','E10C','E11','E12','E14'].includes(doc.type)) {
      check(!all().some(r=>r.type==='E15' && r.status==='Posted' && r.site===doc.site && r.day>=doc.day),'A signed count already covers this date.');
    }
  }
  function book(doc,lines) {
    for (const line of lines??[]) {
      const site=line.site??doc.site;
      check(!closed(site,doc.day),'The stock month is locked.');
      check(!all().some(r=>r.site===site && r.type==='E15' && r.status==='Posted' && r.day>=doc.day),'A signed count already covers this movement.');
    const rows=moves().filter(m=>m.site===site && m.storage===line.storage);
      check(!rows.some(m=>m.day>doc.day),'A later stock movement already exists for this storage location.');
      const location=siteConfig(doc.type,site,doc.day)?.storage.find(row=>row.code===line.storage);
      if(siteFor) check(location,'Choose an approved location from opening stock.');
      const tank=line.storage===review.tank.label,opening=location?.opening??(tank?review.tank.opening:review.bowser.opening);
      const next=round(rows.reduce((v,m)=>v+m.litres,opening)+line.litres);
      check(next>=0 && next<=(location?.safe??(tank?review.tank.safe:review.bowser.capacity)),'Stock would be negative or exceed capacity.');
      db.prepare('INSERT INTO entry_review_moves(doc,site,day,storage,litres) VALUES(?,?,?,?,?)').run(doc.id,site,doc.day,line.storage,line.litres);
    }
  }
  function fresh(type,actor,id=randomUUID()) {
    check(Object.hasOwn(byId,type) && uuid.test(id),'Choose a valid entry.');
    siteConfig(type, actor.site);
    const now = new Date();
    return {id,type,site:actor.site,maker:actor.id,role:entryRole(actor),day:dayFor(actor.site,now),created:now.toISOString(),
      rev:0,status:'Draft',number:'',data:{},result:{},stage:0};
  }
  function checkMaker(doc,actor) {
    const role=entryRole(actor);
    check(doc.site===actor.site && doc.maker===actor.id,'Only the original maker can edit this entry.');
    check(byId[doc.type].maker && (doc.type==='E16'||byId[doc.type].maker===role||(doc.type==='E15'&&role==='Site Store')),'Switch to the entry’s initiator role.');
  }
  function files(doc,field,raw) {
    check(Array.isArray(raw) && raw.length<=16,'Choose up to 16 files per field.');
    return raw.map(f=>{
      if (f?.id) {
        const saved=doc.data[field]?.find(file=>file.id===f.id);
        check(saved,'Choose an attachment already on this entry.'); return saved;
      }
      check(typeof f?.base64==='string' && f.base64.length<=6990508 && /^[A-Za-z0-9+/]+={0,2}$/.test(f.base64),'Invalid attachment or file over 5 MB.');
      const bytes=Buffer.from(f.base64,'base64');
      check(bytes.length<=5242880 && bytes.toString('base64')===f.base64,'Invalid file size or encoding.');
      const mime=bytes.subarray(0,8).toString('hex')==='89504e470d0a1a0a'?'image/png':bytes.subarray(0,3).toString('hex')==='ffd8ff'?'image/jpeg':bytes.subarray(0,5).toString()==='%PDF-'?'application/pdf':null;
      check(mime,'Use a JPEG, PNG or PDF file.');
      check(typeof f.name==='string' && f.name.length<=160 && !/[\\/\x00-\x1f]/.test(f.name),'Use a valid filename.');
      const id=randomUUID();
      db.prepare('INSERT INTO entry_review_files VALUES(?,?,?,?,?)').run(id,doc.id,f.name,mime,bytes);
      return {id,name:f.name};
    });
  }
  function collect(doc,input) {
    check(input && typeof input==='object','Supply the entry fields.');
    const data={};
    for (const field of definition(doc.type,doc.site).fields) {
      const value=input[field.key];
      if (value===undefined || value==='') continue;
      if (field.type==='file') data[field.key]=files(doc,field.key,value);
      else { check(['string','number'].includes(typeof value) && String(value).length<=2000,'Invalid value for '+field.label); data[field.key]=value; }
    }
    return data;
  }
  function calculate(doc) { return evaluate(doc,all(),moves(),policyFor(doc.site, doc.day),siteConfig(doc.type,doc.site,doc.day)); }
  function stampReading(doc,body,now) {
    if (!calendarFor || !['E11','E15'].includes(doc.type)) return;
    const calendar = calendarFor(doc.site);
    const raw = body.data?.readingTime;
    let at = raw ? readingMoment(raw) : null;
    if (raw) check(at && at<=now && calendar.day(at)===doc.day,'Use a reading time within the selected business day.');
    else if (raw===undefined && doc.readingAt) at=new Date(doc.readingAt);
    else {
      const queued=Number.isSafeInteger(body.queued) ? new Date(body.queued) : now;
      if (Number.isFinite(queued.getTime()) && queued<=now && calendar.day(queued)===doc.day) at=queued;
    }
    if (at && calendar.day(at)===doc.day) {
      doc.readingAt=at.toISOString();
      doc.shift=calendar.shift(at) ?? undefined;
    } else {
      delete doc.readingAt;
      delete doc.shift;
    }
  }
  function autoGrn(source) {
    const gate=get(source.data.gate),po=get(gate.data.po);
    const doc=fresh('E7',{site:source.site,id:'Pulse'});
    Object.assign(doc,{maker:'Pulse',role:'System',day:source.day,status:'Posted',data:{gate:gate.id,po:po.id,inspection:source.type==='E6'?source.id:all().find(r=>r.type==='E6'&&r.data.gate===gate.id&&r.status==='Posted')?.id,source:source.id}});
    const fromTank=source.type==='E6';
    const storage=fromTank ? (siteFor?source.data.tank:review.tank.label)
      : (siteFor ? [...new Set(all().filter(row=>row.type==='E10B'&&row.status==='Posted'&&row.data.gate===gate.id).map(row=>row.data.bowser))] : review.bowser.label);
    const price=siteFor ? { vat:po.result.vat, invoiceDiscount:po.result.invoiceDiscount, postSaleDiscount:po.result.postSaleDiscount,
      shortageRate:po.result.shortageRate, rateRef:po.result.rateRef } : {};
    doc.result={ ...source.result,...price,generateGRN:false,approvals:[],supplier:po.data.supplier,invoice:gate.data.invoice,rate:po.result.rate,freight:po.result.freight,
      landed:po.result.landed,basis:po.data.basis,shortageParty:po.result.shortageParty,stockBookedTo:storage };
    assignNumber(doc);
    if (fromTank) book(doc,[{storage,litres:doc.result.accepted}]);
    persist(doc,'Pulse','GRN generated');
    if (doc.result.shortage>0&&!siteFor) {
      const debit=fresh('E9',{site:doc.site,id:doc.site+'-'+roleKey('Accounts Executive'),profile:roleKey('Accounts Executive')});
      debit.day=doc.day; debit.data={grn:doc.id}; persist(debit,'Pulse','Debit note opened for shortage');
    }
  }
  function correct(doc) {
    const original=get(doc.data.target);
    check(original?.status==='Posted','Original has already been revised.');
    checkLocks(original);
    const dependent=all().some(r=>r.id!==doc.id && !['Draft','Returned','Superseded'].includes(r.status)
      && (Object.values(r.data).includes(original.id) || r.result.sources?.includes(original.id)));
    check(!dependent,'A downstream entry already uses this version. Resolve it before correcting.');
    const replacement={...original,id:randomUUID(),rev:0,number:'',data:{...original.data,[doc.data.field]:doc.data.value},replaces:original.id};
    if (replacement.type==='E14' && ['rate','litres'].includes(doc.data.field)) replacement.data.total=money(Number(replacement.data.rate)*Number(replacement.data.litres));
    replacement.data=validateFields(definition(replacement.type,replacement.site),replacement.data);
    original.status='Superseded'; persist(original,doc.maker,'Reversed by '+doc.number);
    book(original,(original.result.moves??[]).map(m=>({...m,litres:-m.litres})));
    replacement.result=calculate(replacement); book(replacement,replacement.result.moves); assignNumber(replacement);
    persist(replacement,doc.maker,'Corrected version'); doc.result.replacement=replacement.id;
  }
  function finish(doc) {
    if (doc.type==='E3') { doc.status='Awaiting Treasury';doc.result.bankFileAt=new Date().toISOString(); return; }
    book(doc,doc.result.moves);
    if (doc.type==='E12') { doc.status='In transit';return; }
    doc.status='Posted';
    if (doc.result.generateGRN) autoGrn(doc);
    if (doc.type==='E16') correct(doc);
  }
  function write(id,actor,body,channel='Pulse web') {
    const nested = db.isTransaction;
    db.exec(nested ? 'SAVEPOINT entry_write' : 'BEGIN IMMEDIATE');
    const commit = () => db.exec(nested ? 'RELEASE entry_write' : 'COMMIT');
    try {
      if (body.token) {
        check(uuid.test(body.token),'Invalid request identifier.');
        const previous=db.prepare('SELECT doc,actor FROM entry_review_requests WHERE token=?').get(body.token);
        if (previous) {
          check(previous.doc===id && previous.actor===actor.id,'Request identifier already used.');
          const saved=read(id,actor.site);commit();return saved;
        }
      }
      const doc=get(id)??fresh(body.type,actor,id);
      check(visible(doc,actor.site),'Entry unavailable for this site.');
      check(Number.isInteger(body.rev) && body.rev===doc.rev,'This entry has changed. Reopen it before continuing.');
      const action=body.action,role=entryRole(actor);
      const now = new Date();
      let log=action;
      if (action==='Save draft' || action==='Submit') {
        checkMaker(doc,actor);
        check(['Draft','Returned'].includes(doc.status),'This entry is already submitted.');
        check(validDate(body.day) && body.day<=dayFor(doc.site,now),'Choose today’s business date or an earlier date.');
        const config=siteConfig(doc.type,doc.site,body.day);
        doc.day=body.day;checkLocks(doc);doc.data=collect(doc,body.data);
        stampReading(doc,body,now);
        doc.status='Draft';
        if (action==='Submit') {
          doc.data=validateFields(definition(doc.type,doc.site),doc.data);
          if (config) {
            const problem=reasonError(doc,config.reasons);
            check(!problem,problem);
          }
          if (siteFor && doc.type==='E11') doc.vehicleChecksVersion=1;
          if (siteFor && doc.type==='E8') doc.billChecksVersion=1;
          doc.result=calculate(doc);assignNumber(doc);doc.stage=0;
          if (doc.result.approvals.length) doc.status='Awaiting approval'; else finish(doc);
        }
      } else if (action==='Approve' || action==='Return') {
        check(mayApproveEntry(doc,actor),'This action belongs to another reviewer or stage.');
        checkLocks(doc);
        if (action==='Return') { check(typeof body.reason==='string' && body.reason.trim() && body.reason.length<=2000,'Give a return reason.'); doc.status='Returned';log+=' · '+body.reason.trim(); }
        else {
          const updated=calculate(doc);
          check(JSON.stringify(updated)===JSON.stringify(doc.result),'Source balances or limits changed. Return this entry to the maker to recalculate.');
          doc.stage++;
          if (doc.stage===doc.result.approvals.length) finish(doc);
        }
      } else if (action==='Confirm UTR') {
        check(doc.status==='Awaiting Treasury' && role==='Treasury' && doc.site===actor.site && actor.id!==doc.maker,'Treasury confirmation is unavailable.');
        checkLocks(doc);
        const utr=String(body.utr??'').trim().toUpperCase();
        check(/^[A-Z0-9-]{5,40}$/.test(utr) && !all().some(r=>r.result.utr===utr),'Enter a valid unique UTR.');
        check(validDate(body.paymentDate) && body.paymentDate>=doc.day && body.paymentDate<=dayFor(doc.site,now),'Check the payment date.');
        Object.assign(doc.result,{utr,paymentDate:body.paymentDate});doc.status='Posted';
      } else if (action==='Confirm receipt' || action==='Approve transfer variance') {
        const first=action==='Confirm receipt';
        check(doc.type==='E12' && doc.result.destination===actor.site && doc.maker!==actor.id && (first?doc.status==='In transit'&&role==='Site Store':doc.status==='Receipt review'&&role==='Project Manager'),'Switch to the receiving site and assigned role.');
        const receiptDay=doc.result.receiptDay??(siteFor?dayFor(actor.site,now):doc.day);
        if (first) {
          const received=Number(body.received);
          check(Number.isFinite(received) && received>0 && received<=doc.data.sent,'Enter received litres up to dispatched litres.');
          const evidence=files(doc,'receiptEvidence',body.evidence??[]);check(evidence.length,'Attach a receipt reading.');
          const difference=round(100*(doc.data.sent-received)/doc.data.sent);
          const limit = policyFor(actor.site, receiptDay).limits.transferLimit;
          const destination=siteConfig(doc.type,actor.site,receiptDay);
          const reasons=destination?entryReasons('E12',destination.reasons).map(row=>row.code):review.reasons;
          check(difference<=limit || reasons.includes(body.reason),'Select a transfer difference reason.');
          Object.assign(doc.result,{received,difference,receiptEvidence:evidence,reason:body.reason??''});
          if (siteFor) doc.result.receiptDay=receiptDay;
          doc.status=difference>limit?'Receipt review':'Posted';
        } else doc.status='Posted';
        if (doc.status==='Posted') {
          const target = siteFor && transferTarget(siteConfig(doc.type,doc.site),doc.data.to,doc.result.destination);
          check(!siteFor || target?.site===actor.site,'The receiving storage is unavailable.');
          book({...doc,day:receiptDay},[{site:actor.site,storage:target?.code??doc.data.to,litres:doc.result.received}]);
        }
      } else throw Error('Choose an available action.');
      if(channel==='Local Telegram') log+=' · Local Telegram / OTP';
      if(channel==='Telegram / SMS OTP') log+=' · '+channel;
      doc.lastAction={role,channel,device:String(body.device??'Local workspace').slice(0,220)};
      if (body.position && Number.isFinite(body.position.latitude) && Math.abs(body.position.latitude)<=90
        && Number.isFinite(body.position.longitude) && Math.abs(body.position.longitude)<=180) {
        doc.lastAction.position={latitude:body.position.latitude,longitude:body.position.longitude};
      }
      persist(doc,actor.id,log);
      if (body.token) db.prepare('INSERT INTO entry_review_requests VALUES(?,?,?)').run(body.token,id,actor.id);
      commit();return doc;
    } catch(e) { db.exec(nested ? 'ROLLBACK TO entry_write; RELEASE entry_write' : 'ROLLBACK');throw e; }
  }
  function stockPicture(site,day=dayFor(site)) {
    const summary=calculate({id:'preview',type:'E1',site,day,data:{litres:1,reason:review.reasons[0],requiredBy:day}});
    return {Project:site,Item:summary.item,'Tank and bowser stock (L)':summary.stock,'In transit (L)':summary.inTransit,
      'Average daily issue (L)':summary.averageDaily,'Days of stock':summary.daysOfStock,'Suggested request (L)':summary.suggested};
  }
  function storageBalances(site) {
    const config=siteFor?.(site), booked=moves().filter(move=>move.site===site);
    return (config?.storage??[]).map(location=>({code:location.code,
      litres:round(booked.filter(move=>move.storage===location.code).reduce((total,move)=>total+move.litres,location.opening))}));
  }
  return {read,write,fresh,definition,stockPicture,storageBalances,dayFor,list:site=>all().filter(r=>visible(r,site)),history:id=>
    db.prepare('SELECT actor,action,stamp,snapshot FROM entry_review_history WHERE doc=? ORDER BY seq').all(id)
      .map(({snapshot,...row})=>{
        const {lastAction,shift}=JSON.parse(snapshot);
        return lastAction ? {...row,meta:{...lastAction,...(shift ? {shift:shift.name} : {})}} : row;
      }),
    file(id,site) { const f=db.prepare('SELECT * FROM entry_review_files WHERE id=?').get(id);check(f,'Attachment unavailable.');read(f.doc,site);return f; }};
}
