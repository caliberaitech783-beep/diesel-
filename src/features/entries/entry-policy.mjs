import { entries } from './catalog.mjs';
import { roles, review } from './review-masters.mjs';

export const policyMasters = ['approval-limit-master', 'tolerance-and-alert-master'];
const key = value => String(value ?? '').trim().toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ');
const roleNames = new Map(roles.map(value => [key(value), value]));
roleNames.set('head of procurement', 'Head – Procurement');
roleNames.set('head of accounts', 'Head – Accounts');
roleNames.set('director', 'Director / CMD');
roleNames.set('cmd', 'Director / CMD');
const role = value => roleNames.get(key(value));
const kind = 'Applies to (all / bulk PO / retail PO)';
const stagedRoles = ['Approver level 1 role', 'Approver level 2 role', 'Approver level 3 role (e.g. Director / CMD)'];

export const alertSettings = {
  'Transit shortage': ['tolerance', '%', 'Site In-charge', 'Project Manager'],
  'Tank to bowser variance': ['bowserLimit', '%', 'Site In-charge', 'Project Manager'],
  'Transfer variance': ['transferLimit', '%', 'Project Manager', 'Director / CMD'],
  'Daily variance': ['countLimit', '%', 'Site In-charge', 'Project Manager'],
  'Tanker empty overdue': ['ttAlertHours', 'h', 'Site In-charge', 'Project Manager'],
  'Repeat fill': ['repeatHours', 'h', 'Site In-charge', 'Project Manager'],
  'Meter jump': ['meterJump', 'h', 'Site In-charge', 'Project Manager'],
  'Approval overdue': ['approvalHours', 'h', null, 'Project Manager'],
  'Calibration due': ['calibrationDays', 'days', 'Site In-charge', 'Project Manager'],
  'Storage below minimum level': ['minimumLevel', 'L', 'Site In-charge', 'Project Manager'],
  'Days of stock': ['daysOfStockLimit', 'days', 'Site In-charge', 'Project Manager'],
  'Credit note pending': ['creditNoteDays', 'days', 'Accounts Executive', 'Head – Accounts'],
};

function amount(value) {
  const text = String(value ?? '').trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{2,3})*,\d{3})(?:\.\d+)?$/.test(text)) return NaN;
  return Number(text.replaceAll(',', ''));
}

function approvalRule(values) {
  const entry = entries.find(({ id, name }) => [key(id), key(name)].includes(key(values.Entry)));
  const scope = values[kind] || 'All';
  const slab = values['Quantity or value slab'];
  const above = /^\s*(?:>|above\s+)\s*([\d,.]+)\s*(?:l|litres|inr|₹)?\s*$/i.exec(slab ?? '');
  const limit = key(slab) === 'all' ? -1 : amount(above?.[1]);
  const approvals = stagedRoles.filter(field => values[field]).map(field => role(values[field]));
  const initiator = ['original maker','maker of the entry'].includes(key(values['Initiator role']))
    ? 'Original maker' : role(values['Initiator role']);
  if (!entry?.maker || initiator !== entry.maker || !Number.isFinite(limit)
    || (limit >= 0 && !['E1', 'E2'].includes(entry.id)) || (scope !== 'All' && entry.id !== 'E2')
    || !approvals[0] || approvals.some(item => !item) || new Set(approvals).size !== approvals.length
    || (scope==='Retail PO' && (approvals[0]!=='Head – Procurement' || !approvals.includes('Director / CMD')))) return null;
  return { type: entry.id, scope, limit, approvals, effective: values['Effective from'],
    telegram: values['Approval on Telegram with OTP allowed (Y/N)'] === 'Yes' };
}

function alertRule(values) {
  const label = Object.keys(alertSettings).find(name => key(name) === key(values.Alert));
  if (!label) return null;
  const [setting, unit] = alertSettings[label];
  const raw = String(values.Limit ?? '').trim();
  const suffix = unit === 'h' ? /\s*(?:h|hours?)$/i : unit === 'days' ? /\s*days?$/i : /\s*%$/;
  const limit = amount(raw.replace(suffix, ''));
  const owner = role(values['First owner (role)']), escalateTo = role(values['Escalate to (role)']);
  const escalateAfter = Number(values['Escalate after (hours)']);
  if (!Number.isFinite(limit) || (unit === '%' && limit > 100) || !owner || !escalateTo
    || !Number.isFinite(escalateAfter) || escalateAfter < 0) return null;
  return { label, setting, limit, owner, escalateTo, escalateAfter, channel: values['Channel (app, e-mail, Telegram)'] };
}

export function validatePolicyMaster(slug, values) {
  if (slug === 'approval-limit-master' && !approvalRule(values)) {
    return 'Use the entry’s initiator, distinct reviewer roles and an applicable slab. Retail POs require Head – Procurement followed by Director / CMD.';
  }
  if (slug === 'tolerance-and-alert-master' && !alertRule(values)) {
    return 'Choose a listed alert, a valid nonnegative limit and escalation time, and existing Diesel roles.';
  }
}

export function entryPolicy(records, site, day) {
  const approval = (records?.['approval-limit-master'] ?? []).map(record => {
    const rule = approvalRule(record.values);
    return rule && { ...rule, specific: Boolean(record.site) };
  }).filter(rule => rule && rule.effective <= day).sort((a, b) =>
    Number(b.specific) - Number(a.specific) || b.limit - a.limit || b.effective.localeCompare(a.effective));
  const alerts = new Map();
  for (const record of records?.['tolerance-and-alert-master'] ?? []) {
    const rule = alertRule(record.values);
    if (rule && (!alerts.has(rule.label) || record.site === site)) alerts.set(rule.label, rule);
  }
  const limits = { tolerance: review.tolerance, transferLimit: review.transferLimit, bowserLimit: review.transferLimit,
    countLimit: review.countLimit, ttAlertHours: review.ttAlertHours, repeatHours: review.repeatHours, meterJump: review.meterJump,
    approvalHours: 24, calibrationDays: 14, ...Object.fromEntries([...alerts.values()].map(rule => [rule.setting, rule.limit])) };
  return { limits, alerts, approvals(doc, result) {
    const scope = doc.data.type === 'Bulk' ? 'Bulk PO' : 'Retail PO';
    const size = doc.type === 'E1' ? result.litres : doc.type === 'E2' ? result.value : 0;
    const retail = doc.type==='E2' && scope==='Retail PO';
    const matching = approval.filter(rule => rule.type === doc.type && (retail ? rule.scope==='Retail PO'
      : rule.scope === 'All' || (doc.type === 'E2' && rule.scope === scope)) && size > rule.limit);
    const match = matching.find(rule => rule.scope !== 'All' && rule.specific === matching[0]?.specific) ?? matching[0];
    return match ? { ...result, approvals: match.approvals, telegramAllowed: match.telegram } : result;
  } };
}
