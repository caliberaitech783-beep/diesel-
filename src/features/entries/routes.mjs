import { lowStorage } from './storage-levels.mjs';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { basename, dirname } from 'node:path';
import { byId } from './catalog.mjs';
import { entryRole } from './review-masters.mjs';
import { createEntryStore } from './entry-store.mjs';
import { registerPage,detailPage,approvalsPage,alertsPage,roleHomePage } from './entry-page.mjs';
import { createLocalApproval } from './local-approval.mjs';
import { pilotEntry } from './entry-access.mjs';
import { entryPolicy } from './entry-policy.mjs';
import { entryAlerts } from './entry-alerts.mjs';
import { registerFilters, filterRegister, entryCsv, entryExcel, entryExportRows, entryCsvRows } from './entry-register.mjs';
import { mayViewEntry, mayViewEntryType } from './entry-visibility.mjs';
import { closeJournalCsv } from './accounting-export.mjs';
import { siteEntryTypes } from './site-masters.mjs';
import { approvedPolicyReader, siteEntryWorkspace } from './site-entry-workspace.mjs';
import { registerOpeningStock } from './opening-stock-routes.mjs';
import { openingStockSetupPage } from './opening-stock-page.mjs';
import { isInvoiceImage, readInvoiceImage } from './invoice-ocr.mjs';
import { createRemoteApproval } from './remote-approval.mjs';
import { registerRemoteApproval } from './remote-approval-routes.mjs';

const qrDecoder = createRequire(import.meta.url).resolve('jsqr');
let readingInvoice = false;

export function registerEntries(app,masterDb,siteDb) {
  const options = siteDb ? siteEntryWorkspace(siteDb,masterDb) : {policyFor:approvedPolicyReader(masterDb)};
  app.use('/entries',createEntriesRouter(siteDb??masterDb,options));
}

export function createEntriesRouter(db, { hosted = false, assigned = false, policyFor = () => entryPolicy(),siteFor,opening,mastersFor,calendarFor,approvalOptions } = {}) {
  const store=createEntryStore(db,{policyFor,siteFor,calendarFor});
  // Telegram notices were withdrawn. Remove the chat IDs they stored.
  db.exec('DROP TABLE IF EXISTS entry_notice_contacts');
  const inbox=assigned||opening ? null : createLocalApproval(db,store);
  const allowedType = type => Object.hasOwn(byId,type)
    && (opening ? siteEntryTypes.includes(type) : !assigned || pilotEntry(type));
  const router=express.Router();
  const enforceVisibility = Boolean(assigned && opening);
  const canRead = (doc, actor) => !enforceVisibility || mayViewEntry(doc,actor);
  const visibleRecords = actor => store.list(actor.site).filter(doc=>canRead(doc,actor));
  const remoteApproval = approvalOptions && createRemoteApproval(db,store,{...approvalOptions,policyFor,dayFor:store.dayFor});
  if (remoteApproval) registerRemoteApproval(router, remoteApproval);
  if (opening) {
    registerOpeningStock(router,opening,mastersFor);
  } else if (hosted) {
    router.get('/opening-stock',(req,res)=>res.send(openingStockSetupPage(req.dieselActor)));
  }
  router.use('/assets',express.static(fileURLToPath(new URL('./assets/',import.meta.url))));
  router.get('/assets/qr-decoder.js',(_req,res)=>res.type('js').sendFile(basename(qrDecoder),{root:dirname(qrDecoder)}));
  if (!assigned||opening) router.post('/invoice-photo', express.raw({ type: 'image/png', limit: '5mb' }), async (req,res) => {
    if (entryRole(req.dieselActor) !== 'Site Store') return res.sendStatus(403);
    if (!isInvoiceImage(req.body)) return res.status(422).json({error:'Choose a clear invoice photo.'});
    if (readingInvoice) return res.status(429).json({error:'Another invoice is being read. Try again in a moment.'});
    readingInvoice = true;
    try { res.json({fields:await readInvoiceImage(req.body)}); }
    catch { res.status(422).json({error:'Could not read this photo. Enter the invoice details by hand.'}); }
    finally { readingInvoice = false; }
  });
  if (!hosted) router.get('/offline-worker.js',(_req,res)=>res.type('text/javascript').sendFile(fileURLToPath(new URL('./assets/offline-worker.js',import.meta.url))));
  router.use((req,_res,next)=>{
    req.dieselActor.businessDay=store.dayFor(req.dieselActor.site);
    next();
  });
  router.get('/',(req,res)=>{
    const actor=req.dieselActor, sources=store.list(actor.site);
    res.send(registerPage(actor,sources.filter(doc=>canRead(doc,actor)),null,req.query,sources));
  });
  router.get('/approvals',(req,res)=>res.send(approvalsPage(req.dieselActor,visibleRecords(req.dieselActor))));
  // Shift and stock for the role home screen. Stock waits until the site's opening stock is set up.
  function siteToday(actor) {
    let stock = null;
    if (!opening || siteFor(actor.site)) {
      try { stock = store.stockPicture(actor.site); } catch { stock = null; }
    }
    return { shift: store.currentShift(actor.site), stock };
  }
  function withAlerts(render, today = false) {
    return (req,res) => {
      const actor = req.dieselActor, rows = visibleRecords(actor);
      const policy = policyFor(actor.site,actor.businessDay);
      if (opening) {
        const approved=mastersFor(actor.site);
        policy.calibrations=approved.instruments;
        policy.lowStorage=lowStorage(store.storageBalances(actor.site),approved.storage);
      }
      if (policy.alerts.has('Days of stock') && (!opening || siteFor(actor.site))) {
        policy.daysOfStock=store.stockPicture(actor.site)['Days of stock'];
      }
      res.send(render(actor, rows, entryAlerts(rows, actor, policy), today ? siteToday(actor) : undefined));
    };
  }
  router.get('/alerts',withAlerts((actor, _rows, alerts) => alertsPage(actor, alerts)));
  router.get('/home',withAlerts(roleHomePage, true));
  router.get('/type/:type',(req,res)=>{
    if (!allowedType(req.params.type)) return res.sendStatus(404);
    const actor=req.dieselActor, sources=store.list(actor.site), rows=sources.filter(doc=>canRead(doc,actor));
    if (enforceVisibility && !mayViewEntryType(req.params.type,actor) && !rows.some(row=>row.type===req.params.type)) {
      return res.sendStatus(403);
    }
    res.send(registerPage(actor,rows,req.params.type,req.query,sources));
  });
  router.get('/new/:type',(req,res)=>{
    const a=req.dieselActor, t=byId[req.params.type];
    if (!allowedType(req.params.type) || !t.maker) return res.sendStatus(404);
    const role = entryRole(a);
    if (t.id!=='E16' && t.maker!==role && !(t.id==='E15' && role==='Site Store')) return res.status(403).send(assigned
      ? 'Your selected role cannot create this entry.' : 'Select the initiator role in the entry register.');
    if (opening) {
      const config=siteFor(a.site);
      if (!config) return res.redirect(303,'/entries/opening-stock');
      if (t.id==='E5'&&!config.receiptScenarios.length) {
        return res.status(409).send('Approve the receipt scenario in Location Master before allowing a tanker in.');
      }
      if (t.id==='E11'&&(!config.vehicles.length||!config.drivers.length||!config.storage.some(row=>row.type==='Bowser'))) {
        return res.status(409).send('Approve vehicles and drivers for this site and include a bowser in opening stock before recording a fuel issue.');
      }
      if (t.id==='E10A'&&!['UG tank','Bowser'].every(type=>config.storage.some(row=>row.type===type))) {
        return res.status(409).send('Opening stock must include a tank and a bowser to record a transfer between them.');
      }
    }
    if (t.id==='E1') {
      try {
        const doc=store.openIndent(a);
        doc.selectedSite=req.query.site===a.site?a.site:'';
        return res.send(detailPage(a,doc,store.list(a.site),[],doc.selectedSite?store.stockPicture(a.site,doc.day):{},store.definition(t.id,a.site)));
      }
      catch(error) { return res.status(422).send(error.message); }
    }
    res.send(detailPage(a,store.fresh(t.id,a),store.list(a.site),[],null,store.definition(t.id,a.site)));
  });
  router.get('/record/:id',(req,res)=>{
    const a=req.dieselActor;
    try {
      const doc = store.read(req.params.id,a.site);
      if (!canRead(doc,a)) return res.sendStatus(404);
      let picture=null;
      if(doc.type==='E1') {
        // Historical records remain readable if their date predates the site's opening stock.
        try {picture=store.stockPicture(a.site,doc.day);} catch { /* Show the stock availability message. */ }
      }
      res.send(detailPage(a,doc,store.list(a.site),store.history(doc.id),picture,store.definition(doc.type,a.site),
        remoteApproval?.enabled(doc,a)));
    }
    catch { res.sendStatus(404); }
  });
  router.get('/file/:id',(req,res)=>{
    try {
      const actor = req.dieselActor;
      const f=store.file(req.params.id,actor.site);
      if (!canRead(store.read(f.doc,actor.site),actor)) return res.sendStatus(404);
      res.attachment(f.name).type(f.mime).send(Buffer.from(f.bytes));
    }
    catch { res.sendStatus(404); }
  });
  router.get('/bank-file/:id',(req,res)=>{
    try {
      const d=store.read(req.params.id,req.dieselActor.site);
      if(entryRole(req.dieselActor)!=='Treasury'||d.type!=='E3'||!d.result.bankFileAt) return res.sendStatus(403);
      res.attachment(d.number+(opening?'-advice.csv':'-review.csv')).type('text/csv')
        .send(entryCsv([['Advice','Supplier','Account status','Net INR'],[d.number,d.result.supplier,d.result.bank,d.result.net]]));
    } catch {res.sendStatus(404);}
  });
  if (inbox) router.post('/approval/:id/:step',express.json({limit:'4kb'}),(req,res)=>{
    try {
      if(req.params.step==='request') return res.json({code:inbox.issue(req.params.id,req.dieselActor)});
      if(req.params.step==='confirm') return res.json({url:'/entries/record/'+inbox.confirm(req.params.id,req.dieselActor,req.body.code).id});
      res.sendStatus(404);
    } catch(e) {res.status(422).json({error:e.message});}
  });
  for (const [extension,mime,serialize] of [
    ['csv','text/csv',rows=>entryCsv(entryCsvRows(rows))],
    ['xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',(rows,sources)=>entryExcel(entryExportRows(rows,sources))],
  ]) router.get('/export.'+extension,(req,res)=>{
    const actor=req.dieselActor,sources=store.list(actor.site);
    const rows=filterRegister(sources.filter(doc=>canRead(doc,actor)),req.query.type,registerFilters(req.query),sources);
    res.attachment('diesel-entries.'+extension).type(mime).send(serialize(rows,sources));
  });
  router.get('/accounting/:id.csv',(req,res)=>{
    const actor = req.dieselActor;
    if (!['Head – Accounts','CFO'].includes(entryRole(actor))) return res.sendStatus(403);
    let close;
    try { close=store.read(req.params.id,actor.site); } catch { return res.sendStatus(404); }
    if (close.type !== 'E17' || close.status !== 'Posted') return res.sendStatus(404);
    res.attachment(close.number+'-review-journal.csv').type('text/csv').send(closeJournalCsv(close));
  });
  router.post('/record/:id',express.json({limit:'40mb'}),(req,res)=>{
    const actor=req.dieselActor;
    if (req.body?.actor!==(actor.actionContext ?? actor.id)) return res.status(403).json({error:'Switch back to the site and role that prepared this action.'});
    if (req.body.offlineScope!==undefined && req.body.offlineScope!==actor.offlineScope) {
      return res.status(403).json({error:'Sign in with the Pulse account that prepared this action.'});
    }
    if (req.body.type!==undefined && !allowedType(req.body.type)) return res.sendStatus(404);
    if ((req.body.action==='Save indent'||(req.body.type==='E1'&&req.body.action==='Save draft')) && req.body.site!==actor.site) {
      return res.status(422).json({error:'Select a location before saving this indent.'});
    }
    try { const doc=store.write(req.params.id,actor,req.body);res.json({url:'/entries/record/'+doc.id,status:doc.status}); }
    catch (e) { res.status(422).json({error:e.message}); }
  });
  return router;
}
