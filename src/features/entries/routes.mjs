import { formatIndentNumber } from './indent-details.mjs';
import { entrySiteDirectory } from './entry-sites.mjs';
import { workspacePage } from './workspace-page.mjs';
import { entryCreationContext, mayStartEntry } from './entry-creation.mjs';
import { shellParts } from './entry-shell.mjs';
import { pendingWork, searchRecords } from './record-search.mjs';
import { dashboardPage } from './dashboard-page.mjs';
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
import { registerFilters, filterRegister, entryCsv, entryExcel, entryExportRows, entryCsvRows, purchaseOrderExportRows, purchaseOrdersOnly, createdCells } from './entry-register.mjs';
import { mayViewEntry, mayViewEntryType } from './entry-visibility.mjs';
import { closeJournalCsv } from './accounting-export.mjs';
import { purchaseOrderPdf, purchaseOrdersPdf, registerPdf } from './purchase-order-pdf.mjs';
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

export function createEntriesRouter(db, { hosted = false, assigned = false, policyFor = () => entryPolicy(),siteFor,opening,mastersFor,calendarFor,approvalOptions,indentApproval,orderApproval } = {}) {
  const store=createEntryStore(db,{policyFor,siteFor,calendarFor});
  // Telegram notices were withdrawn. Remove the chat IDs they stored.
  db.exec('DROP TABLE IF EXISTS entry_notice_contacts');
  const inbox=assigned||opening ? null : createLocalApproval(db,store);
  const allowedType = type => Object.hasOwn(byId,type)
    && (opening ? siteEntryTypes.includes(type) : !assigned || pilotEntry(type));
  const router=express.Router();
  const enforceVisibility = Boolean(assigned && opening);
  const canRead = (doc, actor) => !enforceVisibility || mayViewEntry(doc,actor);
  // Each indent carries its Telegram approval outcome to the screens, and whether this person may edit it.
  const withApproval = (docs, actor) => {
    // A purchase order sent to the listed approvers carries its outcome too, and the controls for a person on that list.
    if (orderApproval) {
      const mayDecide = Boolean(orderApproval.mayDecide(actor.login));
      for (const doc of docs) if (doc.type==='E2') {
        doc.approval=orderApproval.decision(doc.id);
        if (mayDecide && doc.approval?.status==='pending' && doc.status==='Awaiting approval') doc.decide=orderApproval.waiting(doc.id);
      }
    }
    if (!indentApproval) return docs;
    // Only a person on the approver list sees the sanction quantity and the Approve and Decline controls.
    const approver = Boolean(indentApproval.mayDecide?.(actor.login));
    for (const doc of docs) if (doc.type==='E1') {
      doc.approval=indentApproval.decision(doc.id);
      // Once a purchase order uses an approved indent it can no longer be changed.
      doc.canEdit=doc.maker===actor.id && !(doc.status==='Posted' && docs.some(row=>row.type==='E2'&&row.data?.indent===doc.id&&!['Draft','Superseded','Returned'].includes(row.status)));
      if (approver && doc.approval?.status==='pending') doc.decide=indentApproval.waiting(doc.id);
    }
    return docs;
  };
  // Approvals are recorded outside the entry store, so each request first carries any new approval onto its indent.
  const carryApprovals = site => {
    if (orderApproval) for (const doc of store.list(site)) if (doc.type==='E2' && doc.status==='Awaiting approval') {
      const decision=orderApproval.waiting(doc.id);
      if (decision && decision.status!=='pending') store.decideOrder(doc.id,{status:decision.status,by:decision.decided_by,reason:decision.reason});
    }
    if (!indentApproval) return;
    for (const doc of store.list(site)) if (doc.type==='E1' && doc.status==='Saved') {
      const decision=indentApproval.decision(doc.id);
      // An approval taken before the sanction quantity was asked for stands for the quantity requested.
      if (decision?.status==='approved') store.approveIndent(doc.id,{sanctioned:decision.sanctioned??doc.result?.litres,by:decision.by});
    }
  };
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
    carryApprovals(req.dieselActor.site);
    next();
  });
  router.get('/',(req,res)=>{
    const actor=req.dieselActor, sources=registerSources(actor,req.query);
    res.send(registerPage(actor,sources.filter(doc=>canRead(doc,{...actor,site:doc.site??actor.site})),null,req.query,sources));
  });
  router.get('/approvals',(req,res)=>res.send(approvalsPage(req.dieselActor,visibleRecords(req.dieselActor),req.query.type)));
  router.get('/workspace',(req,res)=>{
    res.send(workspacePage(req.dieselActor));
  });
  // The sites this person may open, and the saved entries of some of them without repeats.
  const openSites = actor => entrySiteDirectory(actor).filter(row=>row.allowed!==false).map(row=>[row.site,row.name]);
  const recordsOf = (actor,places) => {
    const found=new Map();
    for (const place of places) for (const doc of store.list(place)) if (canRead(doc,{...actor,site:place})) found.set(doc.id,doc);
    return [...found.values()];
  };
  // What is waiting for this person at their site: approvals to give, and their own returned or draft entries.
  const waitingFor = actor => {
    const rows=withApproval(store.list(actor.site),actor).filter(doc=>canRead(doc,actor));
    return pendingWork(rows,actor);
  };
  router.get('/shell-parts.html',(req,res)=>res.set('Cache-Control','no-store').type('html').send(shellParts(req.dieselActor)));
  router.get('/pending.json',(req,res)=>res.set('Cache-Control','no-store').json(waitingFor(req.dieselActor)));
  // Search box: saved entries by number, supplier, vehicle or entry name, across the sites this person may open.
  router.get('/search.json',(req,res)=>{
    const actor=req.dieselActor;
    res.set('Cache-Control','no-store').json(searchRecords(recordsOf(actor,openSites(actor).map(([value])=>value)),req.query.q));
  });
  // A register normally lists the signed-in site. sites=all, or one site this person may open, widens or moves it;
  // that is how a Dashboard card opens the same records it counted.
  const registerSources = (actor,query) => {
    const places=openSites(actor).map(([value])=>value);
    const chosen=query.sites==='all' ? places : places.includes(query.sites) ? [query.sites] : null;
    return withApproval(chosen ? recordsOf(actor,chosen) : store.list(actor.site),actor);
  };
  // The dashboard reads the saved entries of one site, or of every site this person may open.
  router.get('/dashboard',(req,res)=>{
    const actor=req.dieselActor, sites=openSites(actor);
    const requested=req.query.site??actor.selectedSite??'';
    const site=requested==='all'||sites.some(([value])=>value===requested)?requested:'', chosen=!site||site==='all'?sites.map(([value])=>value):[site];
    const found=new Map(recordsOf(actor,chosen).map(doc=>[doc.id,doc]));
    // Stock is shown only where a site's real opening stock is set up; review sample stock is never presented as a figure.
    const stock=opening ? chosen.flatMap(place=>{
      try {
        if (!siteFor(place)) return [];
        const picture=store.stockPicture(place);
        return [{site:place,litres:picture['Tank and bowser stock (L)'],daily:picture['Average daily issue (L)']}];
      } catch { return []; }
    }) : [];
    const waiting=actor.selectedSite===''?undefined:waitingFor(actor);
    res.send(dashboardPage(actor,[...found.values()],req.query,{sites,site,stock,today:actor.businessDay??store.dayFor(actor.site),waiting}));
  });
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
    const actor=req.dieselActor, sources=registerSources(actor,req.query), rows=sources.filter(doc=>canRead(doc,{...actor,site:doc.site??actor.site}));
    if (enforceVisibility && !mayViewEntryType(req.params.type,actor) && !rows.some(row=>row.type===req.params.type)) {
      return res.sendStatus(403);
    }
    res.send(registerPage(actor,rows,req.params.type,req.query,sources));
  });
  router.get('/start/:type',(req,res)=>{
    const module=byId[req.params.type], actor=req.dieselActor;
    if (!allowedType(req.params.type) || !module.maker) return res.sendStatus(404);
    if (mayStartEntry(actor,module)) return res.redirect(303,'/entries/new/'+module.id);
    res.redirect(303,'/entries/workspace');
  });
  router.post('/start/:type',(req,res)=>{
    const module=byId[req.params.type], actor=req.dieselActor;
    if (!allowedType(req.params.type) || !module.maker) return res.sendStatus(404);
    const context=entryCreationContext(actor,module);
    if (!context) return res.status(403).send('Your account has no maker assignment for this module.');
    if (!mayStartEntry(actor,module) && !req.activateEntryContext?.(context)) return res.sendStatus(403);
    res.redirect(303,'/entries/new/'+module.id);
  });
  router.get('/new/:type',(req,res)=>{
    const a=req.dieselActor, t=byId[req.params.type];
    if (!allowedType(req.params.type) || !t.maker) return res.sendStatus(404);
    if (!mayStartEntry(a,t)) return res.status(403).send(assigned
      ? 'Your selected assignment cannot create this entry. Use New entry in Workspace to choose a permitted site.'
      : 'Use New entry in Workspace to choose a site for this module.');
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
  // A saved purchase order as a PDF, for anyone who may open the record.
  router.get('/record/:id/purchase-order.pdf',async (req,res,next)=>{
    const a=req.dieselActor;
    let doc;
    try { doc=store.read(req.params.id,a.site); } catch { return res.sendStatus(404); }
    if (doc.type!=='E2' || !canRead(doc,a)) return res.sendStatus(404);
    try {
      const bytes=await purchaseOrderPdf(doc,store.list(a.site));
      res.attachment((doc.number||'purchase-order-draft').replace(/[^\w.-]+/g,'-')+'.pdf').type('application/pdf').send(Buffer.from(bytes));
    } catch(error) { next(error); }
  });
  router.get('/record/:id',(req,res)=>{
    const a=req.dieselActor;
    try {
      const doc = store.read(req.params.id,a.site);
      if (!canRead(doc,a)) return res.sendStatus(404);
      withApproval([doc],a);
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
  // Records ticked on the register: only those are exported.
  const picked = (rows,ids) => { const chosen=new Set(String(ids??'').split(',').filter(Boolean)); return chosen.size?rows.filter(doc=>chosen.has(doc.id)):rows; };
  for (const [extension,mime,serialize] of [
    ['csv','text/csv',(rows,sources)=>entryCsv(purchaseOrdersOnly(rows)?purchaseOrderExportRows(rows,sources):entryCsvRows(rows,sources))],
    ['xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',(rows,sources)=>entryExcel(purchaseOrdersOnly(rows)?purchaseOrderExportRows(rows,sources):entryExportRows(rows,sources))],
  ]) router.get('/export.'+extension,(req,res)=>{
    const actor=req.dieselActor,sources=registerSources(actor,req.query);
    const rows=picked(filterRegister(sources.filter(doc=>canRead(doc,{...actor,site:doc.site??actor.site})),req.query.type,registerFilters(req.query),sources),req.query.ids);
    res.attachment((purchaseOrdersOnly(rows)?'diesel-purchase-orders.':'diesel-entries.')+extension).type(mime).send(serialize(rows,sources));
  });
  // The register as a PDF: purchase orders in full, one after another; any other register as a list.
  router.get('/export.pdf',async (req,res,next)=>{
    const actor=req.dieselActor,sources=registerSources(actor,req.query);
    const rows=picked(filterRegister(sources.filter(doc=>canRead(doc,{...actor,site:doc.site??actor.site})),req.query.type,registerFilters(req.query),sources),req.query.ids);
    try {
      const orders=purchaseOrdersOnly(rows);
      const bytes=orders ? await purchaseOrdersPdf(rows.slice(0,200),sources)
        : await registerPdf('Diesel entries',['Document','Entry','Site','Date','Status','Created'],rows.map(row=>[formatIndentNumber(row.number),byId[row.type].name,row.site,row.day,row.status,createdCells(row).slice(0,2).join(' ')]));
      res.attachment(orders?'diesel-purchase-orders.pdf':'diesel-entries.pdf').type('application/pdf').send(Buffer.from(bytes));
    } catch(error) { next(error); }
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
    // A purchase order sent to the listed approvers is decided by them alone, not by the review roles.
    if (['Approve','Return'].includes(req.body.action) && orderApproval?.waiting(req.params.id)) {
      return res.status(422).json({error:'This purchase order is approved or declined by the people on the purchase order approver list.'});
    }
    try {
      const doc=store.write(req.params.id,actor,req.body);
      // A saved indent goes to its approvers on Telegram. Delivery never holds up or fails the save.
      if (req.body.action==='Save indent' && doc.type==='E1') indentApproval?.requested(doc);
      // A saved purchase order goes to its own approvers with its PDF. Taking it back to edit withdraws the request.
      if (doc.type==='E2' && req.body.action==='Submit' && doc.status==='Awaiting approval') orderApproval?.requested(doc,store.list(doc.site));
      if (doc.type==='E2' && req.body.action==='Edit') orderApproval?.withdraw(doc.id);
      res.json({url:'/entries/record/'+doc.id,status:doc.status});
    }
    catch (e) { res.status(422).json({error:e.message}); }
  });
  return router;
}
