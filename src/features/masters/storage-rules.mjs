import { MasterRecordError } from './records-fields.mjs';

export function validateStorage(values) {
  const capacity = Number(values['Capacity (L)']);
  const safe = Number(values['Safe fill level (L)']);
  const minimum = Number(values['Minimum level (L)']);
  if (!(capacity > 0 && safe > 0 && minimum >= 0 && minimum <= safe && safe <= capacity)) {
    throw new MasterRecordError('Enter a positive capacity and safe fill level. Minimum ≤ safe fill ≤ capacity.');
  }
  if (values['Storage type'] === 'UG tank' && !values['Calibration chart (dip-to-litres table, UG tanks)']) {
    throw new MasterRecordError('Enter the dip-to-litres calibration chart for this underground tank.');
  }
  if (values['TT empty alert after (hours)'] && Number(values['TT empty alert after (hours)']) < 0) {
    throw new MasterRecordError('TT empty alert hours must be zero or greater.');
  }
}
