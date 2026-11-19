import { alertSettings } from './entry-policy.mjs';
import { entryRole, review } from './review-masters.mjs';

export function entryAlerts(rows, actor, policy, now = Date.now()) {
  const role = entryRole(actor), alerts = [];
  const { limits } = policy;
  const hoursSince = timestamp => (now - Date.parse(timestamp)) / 3600000;
  function add(label, doc, detail, overdueAfter = 0, reviewer) {
    const config = policy.alerts.get(label);
    const [, , defaultOwner, defaultEscalation] = alertSettings[label];
    const owner = config?.owner ?? reviewer ?? defaultOwner;
    const escalation = config?.escalateTo ?? defaultEscalation;
    const age = hoursSince(doc.updated ?? doc.created);
    const escalated = age >= overdueAfter + (config?.escalateAfter ?? 24);
    if (role === owner || (escalated && role === escalation)) {
      alerts.push({ id: doc.id, number: doc.number, label, detail, owner, escalation: escalated && escalation !== owner ? escalation : null });
    }
  }

  for (const doc of rows) {
    if (['Draft', 'Returned', 'Superseded'].includes(doc.status)) continue;
    const { type, result } = doc;
    if (doc.site === actor.site) {
      if (['E6', 'E10C'].includes(type) && result.shortage > result.invoiceLitres * limits.tolerance / 100) {
        add('Transit shortage', doc, result.shortage + ' L short');
      }
      if (type === 'E10A' && result.difference > limits.bowserLimit) add('Tank to bowser variance', doc, result.difference + '%');
      if (type === 'E15') {
        const measurements = result.measurements ?? [{code:'Tank',variance:result.tankVariance},{code:'Bowser',variance:result.bowserVariance}];
        const differences = measurements.filter(row=>row.variance);
        if (result.variancePercent > limits.countLimit || (result.variancePercent === null && differences.length)) {
          add('Daily variance', doc, differences.map(row=>row.code+' '+row.variance+' L').join(' · '));
        }
      }
      if (type === 'E5' && doc.status === 'Posted' && doc.data.scenario === 'Direct to bowsers'
        && hoursSince(doc.updated ?? doc.created) >= limits.ttAlertHours
        && !rows.some(row => row.data.gate === doc.id && row.status === 'Posted'
          && (row.type === 'E10C' || (row.type === 'E6' && row.data.decision === 'Reject')))) {
        add('Tanker empty overdue', doc, doc.data.truck, limits.ttAlertHours);
      }
      if (doc.status === 'Awaiting approval' && hoursSince(doc.updated ?? doc.created) >= limits.approvalHours) {
        add('Approval overdue', doc, 'Waiting for ' + result.approvals[doc.stage], limits.approvalHours, result.approvals[doc.stage]);
      }
    }
    if (type === 'E12' && result.destination === actor.site && result.difference > limits.transferLimit) {
      add('Transfer variance', doc, result.difference + '% received difference');
    }
  }
  const calibration = policy.calibration ?? { name: review.instrument, due: review.calibrationDue };
  if (Date.parse(calibration.due) - now <= limits.calibrationDays * 86400000) {
    const owner = policy.alerts.get('Calibration due')?.owner ?? 'Site In-charge';
    if (role === owner) alerts.push({ label: 'Calibration due', detail: calibration.name + ' · ' + calibration.due, owner });
  }
  return alerts;
}
