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

test('approval and alert rules pick entry codes, posts and alerts from fixed lists', async () => {
  const { masterDefinition, validateScalar } = await import('./records-fields.mjs');
  const { roles } = await import('../entries/review-masters.mjs');
  const { readRecordRows } = await import('./assets/bulk-rows.mjs');
  const approval = masterDefinition('approval-limit-master'), field = key => approval.fields.find(item => item.key === key);
  for (const key of ['Initiator role','Approver level 1 role','Approver level 2 role','Approver level 3 role (e.g. Director / CMD)']) {
    assert.deepEqual(field(key).options, roles);
  }
  assert.ok(field('Entry').options.includes('E2') && !field('Entry').options.includes('E7'));
  assert.equal(field('Entry').optionLabels.get('E1'), 'E1 · Diesel indent');
  assert.throws(() => validateScalar(field('Approver level 1 role'), 'Projct Manager'), /Choose a listed value for Approver level 1 role/);
  assert.equal(validateScalar(field('Approver level 1 role'), 'Project Manager'), 'Project Manager');
  const alert = masterDefinition('tolerance-and-alert-master').fields;
  assert.deepEqual(alert.find(item => item.key === 'Escalate to (role)').options, roles);
  assert.throws(() => validateScalar(alert.find(item => item.key === 'Alert'), 'Low stock'), /listed value/);
  const { records } = readRecordRows([['Entry','Initiator role','Approver level 1 role','Approver level 2 role'],
    ['e1','site in-charge','head - procurement','HEAD-ACCOUNTS']], approval.fields.map(({ key, label, type, options }) => ({ key, label, type, options })));
  assert.deepEqual(records[0].values.map(([, value]) => value), ['E1','Site In-charge','Head – Procurement','Head – Accounts']);
});
