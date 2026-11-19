import { businessDay, validDate } from './entry-rules.mjs';
import { entryRole } from './review-masters.mjs';
import { parseDipChart } from './site-masters.mjs';

export class OpeningStockError extends Error {
  constructor(message,status=422) { super(message);this.status=status; }
}

const assert = (condition,message,status) => { if (!condition) throw new OpeningStockError(message,status); };
function rateValue(value) {
  assert(/^\d+(?:\.\d{1,4})?$/.test(String(value)) && Number(value)>0 && Number(value)<=1e9,
    'Enter the Accounts-approved opening stock value per kilolitre as a positive amount.');
  return Number(value);
}

export function createOpeningStockStore(db, mastersFor) {
  db.exec(`CREATE TABLE IF NOT EXISTS diesel_opening_stock(site TEXT PRIMARY KEY, snapshot TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS diesel_opening_stock_history(seq INTEGER PRIMARY KEY, site TEXT NOT NULL, snapshot TEXT NOT NULL);`);
  const get = site => {
    const row = db.prepare('SELECT snapshot FROM diesel_opening_stock WHERE site=?').get(site);
    return row ? JSON.parse(row.snapshot) : null;
  };
  function snapshot(site,input) {
    const { items,storage } = mastersFor(site);
    const item = items.find(record=>record.code===input.item);
    assert(item,'Choose an approved active item for this site.');
    assert(item.volumeBasis==='Observed litres','The site ledger needs an approved item measured in observed litres.');
    assert(storage.length,'Approve at least one tank or bowser in Storage Location Master first.');
    const measuredAt = input.measuredAt;
    assert(typeof measuredAt==='string' && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(measuredAt)
      && validDate(measuredAt.slice(0,10)) && Date.parse(measuredAt+'+05:30')<=Date.now(),'Enter the actual date and time of measurement in IST.');
    const asOf = new Date(measuredAt+'+05:30');
    const amounts = new Map((Array.isArray(input.readings)?input.readings:[]).map(row=>[row?.code,row?.litres]));
    assert(amounts.size===storage.length && input.readings.length===storage.length,'Enter one opening quantity per approved storage location.');
    const readings = storage.map(record=>{
      const raw = amounts.get(record.code);
      const value = String(raw ?? '').trim();
      assert(/^\d+(?:\.\d{1,4})?$/.test(value) && Number(value)<=record.safe,'Enter measured litres from zero to safe fill for '+record.code+'.');
      const chart = record.type==='UG tank' ? parseDipChart(record.chart,record.safe) : null;
      assert(record.type!=='UG tank'||chart,'Add an approved dip chart for '+record.code+' with increasing cm,litres rows up to safe fill.');
      return { ...record,chart,opening:Number(value) };
    });
    const openingRate=input.openingRate===undefined||input.openingRate==='' ? undefined : rateValue(input.openingRate);
    return { item, storage:readings, measuredAt, businessDay:businessDay(asOf), openingRate };
  }
  function transact(actor,update) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result=update(get(actor.site));
      const json=JSON.stringify(result);
      db.prepare('INSERT INTO diesel_opening_stock VALUES(?,?) ON CONFLICT(site) DO UPDATE SET snapshot=excluded.snapshot').run(actor.site,json);
      db.prepare('INSERT INTO diesel_opening_stock_history(site,snapshot) VALUES(?,?)').run(actor.site,json);
      db.exec('COMMIT');
      return result;
    } catch (error) { db.exec('ROLLBACK');throw error; }
  }
  function submit(actor,input) {
    assert(entryRole(actor)==='Site In-charge','The Site In-charge records opening stock.',403);
    return transact(actor,current=>{
      assert(current?.status!=='approved','Opening stock is approved and locked.',409);
      assert(Number(input.revision)===(current?.revision??0),'Opening stock changed. Reopen it before saving.',409);
      return { ...snapshot(actor.site,input), status:'pending', revision:(current?.revision??0)+1, maker:actor.id, savedAt:new Date().toISOString() };
    });
  }
  function approve(actor,revision) {
    assert(entryRole(actor)==='Project Manager','A Project Manager approves opening stock.',403);
    return transact(actor,current=>{
      assert(current?.status==='pending' && current.revision===Number(revision),'Reopen the current submission before approval.',409);
      assert(current.maker!==actor.id,'A different person must approve opening stock.',403);
      const fresh=snapshot(actor.site,{item:current.item.code,measuredAt:current.measuredAt,openingRate:current.openingRate,readings:current.storage.map(row=>({code:row.code,litres:row.opening}))});
      assert(JSON.stringify(fresh.item)===JSON.stringify(current.item)&&JSON.stringify(fresh.storage)===JSON.stringify(current.storage),
        'An approved master changed. Ask the Site In-charge to review and resubmit.',409);
      return { ...current,status:'approved',revision:current.revision+1,checker:actor.id,approvedAt:new Date().toISOString() };
    });
  }
  function submitRate(actor,input) {
    assert(entryRole(actor)==='Site In-charge','The Site In-charge records the approved opening rate.',403);
    return transact(actor,current=>{
      assert(current?.status==='approved'&&!current.openingRate&&current.revision===Number(input.revision),
        'Reopen the current opening stock to add its valuation.',409);
      return { ...current,revision:current.revision+1,
        rateProposal:{ rate:rateValue(input.openingRate),maker:actor.id,savedAt:new Date().toISOString() } };
    });
  }
  function approveRate(actor,revision) {
    assert(entryRole(actor)==='Project Manager','A Project Manager approves the opening valuation.',403);
    return transact(actor,current=>{
      assert(current?.status==='approved'&&current.rateProposal&&!current.openingRate&&current.revision===Number(revision),
        'Reopen the current opening valuation before approving.',409);
      const {rateProposal,...record}=current;
      assert(rateProposal.maker!==actor.id,'A different person must approve the opening valuation.',403);
      return { ...record,revision:record.revision+1,openingRate:rateProposal.rate,
        openingRateApprovedBy:actor.id,openingRateApprovedAt:new Date().toISOString() };
    });
  }
  return { get,submit,approve,submitRate,approveRate };
}
