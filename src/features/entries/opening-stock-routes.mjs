import express from 'express';
import { OpeningStockError } from './opening-stock.mjs';
import { openingStockPage } from './opening-stock-page.mjs';

export function registerOpeningStock(router,store,mastersFor) {
  const page = (req,res,error,draft) => {
    const actor=req.dieselActor;
    res.status(error?.status??200).send(openingStockPage(actor,mastersFor(actor.site),store.get(actor.site),error?.message,draft));
  };
  const body = express.urlencoded({extended:false,limit:'32kb'});
  const list = value => Array.isArray(value)?value:value===undefined?[]:[value];
  router.get('/opening-stock',(req,res)=>page(req,res));
  router.post('/opening-stock',body,(req,res,next)=>{
    const input=req.body??{};
    const amounts=list(input.litres), codes=list(input.code);
    const draft={...input,readings:codes.map((code,index)=>({code,litres:amounts[index]}))};
    try {
      if(amounts.length!==codes.length) throw new OpeningStockError('Enter one measurement for each storage location.');
      store.submit(req.dieselActor,draft);
      res.redirect(303,'/entries/opening-stock');
    } catch(error) { if(error instanceof OpeningStockError) page(req,res,error,draft); else next(error); }
  });
  router.post('/opening-stock/approve',body,(req,res,next)=>{
    try {
      store.approve(req.dieselActor,req.body?.revision);
      res.redirect(303,'/entries/opening-stock');
    } catch(error) { if(error instanceof OpeningStockError) page(req,res,error); else next(error); }
  });
}
