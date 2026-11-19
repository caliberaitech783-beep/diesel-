import assert from 'node:assert/strict';
import test from 'node:test';
import { checkOperator, operatorAccess } from './operator-authorisation.mjs';
import { lowStorage } from './storage-levels.mjs';
import { entryAlerts } from './entry-alerts.mjs';
import { entryPolicy } from './entry-policy.mjs';
import { roleKey } from './review-masters.mjs';

test('Driver Master limits an operator to the listed bowsers and leaves unlisted operators unrestricted', () => {
  const drivers = [{ code:'E-1', ...operatorAccess({ 'Login ID':' Ravi.K ', 'Bowsers or points authorised':'B-07; b-09\nT-1' }) },
    { code:'E-2', ...operatorAccess({ 'Login ID':'open.operator' }) }, { code:'E-3', ...operatorAccess({}) }];
  const as = maker => ({ doc:{ maker }, siteConfig:{ drivers } });
  assert.deepEqual(drivers[0].authorised,['b-07','b-09','t-1']);
  checkOperator(as('ravi.k'),'B-09');
  assert.throws(() => checkOperator(as('ravi.k'),'B-12'),/does not authorise you for B-12/);
  checkOperator(as('open.operator'),'B-12');
  checkOperator(as('unknown.user'),'B-12');
  checkOperator({ doc:{ maker:'ravi.k' } },'B-12');
});

test('storage below its approved minimum level alerts the Site In-charge', () => {
  const low = lowStorage([{ code:'T-1', litres:900 },{ code:'T-2', litres:5000 },{ code:'B-1', litres:0 },{ code:'OLD', litres:1 }],
    [{ code:'T-1', minimum:1000 },{ code:'T-2', minimum:1000 },{ code:'B-1', minimum:0 },{ code:'B-9', minimum:50 }]);
  assert.deepEqual(low,[{ code:'T-1', litres:900, minimum:1000 }]);
  const policy = { ...entryPolicy(), lowStorage:low, calibrations:[] };
  const alertsFor = role => entryAlerts([],{ site:'Jayant', profile:roleKey(role) },policy);
  assert.deepEqual(alertsFor('Site In-charge').map(alert => [alert.label,alert.detail]),
    [['Storage below minimum level','T-1 · 900 L in stock · minimum 1000 L']]);
  assert.deepEqual(alertsFor('Bowser operator'),[]);
});
