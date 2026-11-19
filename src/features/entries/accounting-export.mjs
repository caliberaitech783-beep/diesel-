import { entryCsv } from './entry-register.mjs';

export function closeJournalCsv(document) {
  const { journal, litres, rate, closingValue } = document.result;
  return entryCsv([
    ['Close reference', 'Site', 'Period', 'Account or cost centre', 'Debit (INR)', 'Credit (INR)', 'Closing litres', 'Rate (INR/KL)', 'Closing value (INR)'],
    ...journal.map(line => [document.number, document.site, document.data.month, line.account,
      line.debit.toFixed(2), line.credit.toFixed(2), litres, rate, closingValue]),
  ]);
}
