export const toleranceAndAlertMaster = [
  {
    name: 'Alert and escalation',
    fields: [
      { label: 'Alert', required: true },
      { label: 'Limit', required: true },
      { label: 'First owner (role)', required: true },
      { label: 'Escalate to (role)', required: true },
      { label: 'Escalate after (hours)', required: true, type: 'number' },
      { label: 'Channel (app, e-mail, Telegram)', required: true, options: ['App', 'E-mail', 'Telegram'] },
    ],
  },
];
