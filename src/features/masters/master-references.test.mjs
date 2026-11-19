import assert from 'node:assert/strict';
import test from 'node:test';
import { referenceChoices, referenceProblem } from './master-references.mjs';

const approved = {
  'account-master': [{ code:'SUP', name:'Oil company', values:{ 'Is Market Petrol Pump':'No' } },
    { code:'PUMP', name:'Retail pump', values:{ 'Is Market Petrol Pump':'Yes' } }],
  'supplier-depot-master': [{ values:{ 'Depot name':'Jamnagar', 'Supplier (A/C Code)':'SUP' } },
    { values:{ 'Depot name':'Pump yard', 'Supplier (A/C Code)':'PUMP' } }],
  'location-master': [{ code:'J-01', name:'Jayant OC', values:{} }],
  'storage-location-master': [{ code:'T-1', name:'Main tank', values:{ 'Storage type':'UG tank' } },
    { code:'B-9', name:'Bowser nine', values:{ 'Storage type':'Bowser' } }, { code:'TT', name:'Tanker', values:{ 'Storage type':'Tank truck (TT)' } }],
};

test('master fields that name another master offer and accept only approved records', () => {
  const freight = referenceChoices('transport-freight-master', approved);
  assert.deepEqual([...freight.get('Transporter')], [['SUP','Oil company · SUP']]);
  assert.deepEqual([...freight.get('From depot').keys()], ['Jamnagar','Pump yard']);
  assert.deepEqual([...freight.get('To site')], [['J-01','Jayant OC · J-01']]);
  assert.deepEqual([...referenceChoices('storage-location-master', approved).get('Home tank').keys()], ['T-1']);
  assert.deepEqual([...referenceChoices('measuring-instrument-master', approved).get('Fitted on (tank, bowser)').keys()], ['T-1','B-9']);
  assert.equal(referenceChoices('item-master', approved).size, 0);

  const rate = { Supplier:'SUP', Depot:'Jamnagar' };
  assert.equal(referenceProblem('diesel-rate-master', approved, rate), undefined);
  assert.match(referenceProblem('diesel-rate-master', approved, { ...rate, Supplier:'sup' }), /Account Master record for Supplier/);
  assert.match(referenceProblem('diesel-rate-master', approved, { ...rate, Depot:'Pump yard' }), /depot approved for this supplier/);
  assert.match(referenceProblem('transport-freight-master', approved, { Transporter:'PUMP', 'From depot':'Jamnagar', 'To site':'J-01' }), /Transporter/);
  assert.equal(referenceProblem('storage-location-master', approved, {}), undefined);
  assert.match(referenceProblem('storage-location-master', approved, { 'Home tank':'B-9' }), /Home tank/);
  const older = { Supplier:'Old name', Depot:'Old depot' };
  assert.equal(referenceProblem('diesel-rate-master', approved, older, older), undefined);
  assert.match(referenceProblem('diesel-rate-master', approved, { ...older, Depot:'Jamnagar' }, older), /depot approved for this supplier/);
});
