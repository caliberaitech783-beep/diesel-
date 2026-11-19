import { roles } from '../entries/review-masters.mjs';

export const toleranceAndAlertMaster = [
  {
    name: 'Alert and escalation',
    fields: [
      { label: 'Alert', required: true, options: ['Transit shortage','Tank to bowser variance','Transfer variance','Daily variance',
        'Tanker empty overdue','Repeat fill','Meter jump','Approval overdue','Calibration due','Days of stock','Storage below minimum level'] },
      { label: 'Limit', required: true, hint: 'Use percent for variances, hours for overdue and meter rules, or days for calibration and stock cover.' },
      { label: 'First owner (role)', required: true, options: roles },
      { label: 'Escalate to (role)', required: true, options: roles },
      { label: 'Escalate after (hours)', required: true, type: 'number' },
      { label: 'Channel (app, e-mail, Telegram)', required: true, options: ['App', 'E-mail', 'Telegram'] },
    ],
  },
];
