import express from 'express';
import { fileURLToPath } from 'node:url';
import { byId } from './catalog.mjs';
import { entryRole } from './review-masters.mjs';
import { createEntryStore } from './entry-store.mjs';
import { registerPage,detailPage } from './entry-page.mjs';
import { createLocalApproval } from './local-approval.mjs';

export function registerEntries(app,db) {
  app.use('/entries',createEntriesRouter(db));
}

export function createEntriesRouter(db, { hosted = false } = {}) {
  const store=createEntryStore(db);
  const inbox=createLocalApproval(db,store);
  const router=express.Router();
  router.use('/assets',express.static(fileURLToPath(new URL('./assets/',import.meta.url))));
  if (!hosted) router.get('/offline-worker.js',(_req,res)=>res.type('text/javascript').sendFile(fileURLToPath(new URL('./assets/offline-worker.js',import.meta.url))));
  router.get('/',(req,res)=>res.send(registerPage(req.dieselActor,store.list(req.dieselActor.site),null,req.query)));
  router.get('/type/:type',(req,res)=>{
    if (!Object.hasOwn(byId,req.params.type)) return res.sendStatus(404);
    res.send(registerPage(req.dieselActor,store.list(req.dieselActor.site),req.params.type,req.query));
  });
  router.get('/new/:type',(req,res)=>{
    const a=req.dieselActor, t=byId[req.params.type];
    if (!t?.maker) return res.sendStatus(404);
    if (t.id!=='E16' && t.maker!==entryRole(a)) return res.status(403).send('Select the initiator role in the entry register.');
    res.send(detailPage(a,store.fresh(t.id,a),store.list(a.site),[],t.id==='E1'?store.stockPicture(a.site):null));
  });
  router.get('/record/:id',(req,res)=>{
    const a=req.dieselActor;
    try { const doc=store.read(req.params.id,a.site);res.send(detailPage(a,doc,store.list(a.site),store.history(doc.id),doc.type==='E1'&&['Draft','Returned'].includes(doc.status)?store.stockPicture(a.site,doc.day):null)); }
    catch { res.sendStatus(404); }
  });
  router.get('/file/:id',(req,res)=>{
    try { const f=store.file(req.params.id,req.dieselActor.site);res.attachment(f.name).type(f.mime).send(Buffer.from(f.bytes)); }
    catch { res.sendStatus(404); }
  });
  router.get('/bank-file/:id',(req,res)=>{
    try {
      const d=store.read(req.params.id,req.dieselActor.site);
      if(entryRole(req.dieselActor)!=='Treasury'||d.type!=='E3'||!d.result.bankFileAt) return res.sendStatus(403);
      res.attachment(d.number+'-review.csv').type('text/csv').send('Advice,Supplier,Review account,Net INR\r\n'+[d.number,d.result.supplier,d.result.bank,d.result.net].join(',')+'\r\n');
    } catch {res.sendStatus(404);}
  });
  router.post('/approval/:id/:step',express.json({limit:'4kb'}),(req,res)=>{
    try {
      if(req.params.step==='request') return res.json({code:inbox.issue(req.params.id,req.dieselActor)});
      if(req.params.step==='confirm') return res.json({url:'/entries/record/'+inbox.confirm(req.params.id,req.dieselActor,req.body.code).id});
      res.sendStatus(404);
    } catch(e) {res.status(422).json({error:e.message});}
  });
  router.get('/export.csv',(req,res)=>{
    const rows=store.list(req.dieselActor.site).filter(r=>(!req.query.type||req.query.type===r.type)&&(!req.query.status||r.status===req.query.status)
      && (!req.query.q||[r.number,r.type,byId[r.type].name,...Object.values(r.data).filter(v=>typeof v==='string')].join(' ').toLowerCase().includes(String(req.query.q).toLowerCase())));
    const csvCell=v=>'"'+String(v??'').replace(/^([=+@\-\t\r])/,"'$1").replaceAll('"','""')+'"';
    const data=[['Document','Entry','Site','Date','Status','Details','Results'],...rows.map(r=>[r.number,byId[r.type].name,r.site,r.day,r.status,JSON.stringify(r.data),JSON.stringify(r.result)])];
    res.attachment('diesel-entries.csv').type('text/csv').send('\uFEFF'+data.map(row=>row.map(csvCell).join(',')).join('\r\n'));
  });
  router.post('/record/:id',express.json({limit:'40mb'}),(req,res)=>{
    const actor=req.dieselActor;
    if (req.body?.actor!==actor.id) return res.status(403).json({error:'Switch back to the site and role that prepared this action.'});
    try { const doc=store.write(req.params.id,actor,req.body);res.json({url:'/entries/record/'+doc.id,status:doc.status}); }
    catch (e) { res.status(422).json({error:e.message}); }
  });
  return router;
}
