const daySeconds = 24 * 60 * 60;
const istSeconds = 5.5 * 60 * 60;
const defaultCutoff = 6 * 60 * 60;

function seconds(value) {
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)) return null;
  const [hours, minutes, remainder = 0] = value.split(':').map(Number);
  return hours * 3600 + minutes * 60 + remainder;
}

function shiftRow(record) {
  const values = record.values;
  return { id: record.id, name: values['Shift name'], start: seconds(values['Start time']),
    end: seconds(values['End time']), cutoff: seconds(values['Business day cut-off']) };
}

function segments({start,end}) {
  return start < end ? [[start,end]] : [[start,daySeconds],[0,end]];
}

export function validateEntryShift(record, existing) {
  const shift = shiftRow(record);
  if (!shift.name || [shift.start,shift.end,shift.cutoff].includes(null) || shift.start === shift.end) {
    return 'Enter a shift name, different start and end times, and a business-day cut-off.';
  }
  for (const other of existing.filter(row=>row.id!==record.id).map(shiftRow)) {
    if (shift.cutoff !== other.cutoff) return 'Use the same business-day cut-off for all approved shifts at this site.';
    const overlaps = segments(shift).some(([from,to])=>segments(other).some(([start,end])=>from<end && start<to));
    if (overlaps) return 'This shift overlaps the approved shift ' + other.name + '.';
  }
}

export function entryCalendar(shifts = [], location) {
  const rows = shifts.map(shiftRow).filter(row =>
    row.name && ![row.start,row.end,row.cutoff].includes(null) && row.start!==row.end);
  const cutoffs = new Set(rows.map(row=>row.cutoff));
  const cutoff = (cutoffs.size===1 ? rows[0].cutoff : seconds(location?.values['Business day cut-off'])) ?? defaultCutoff;
  return {
    day(now = new Date()) {
      return new Date(now.getTime()+(istSeconds-cutoff)*1000).toISOString().slice(0,10);
    },
    shift(now) {
      const clock = ((Math.floor(now.getTime()/1000)+istSeconds)%daySeconds+daySeconds)%daySeconds;
      const match = rows.filter(row=>segments(row).some(([from,to])=>clock>=from && clock<to));
      return match.length===1 ? { id:match[0].id, name:match[0].name } : null;
    },
  };
}

export function readingMoment(value) {
  if (typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)) return null;
  const date = new Date(value+'+05:30');
  if (!Number.isFinite(date.getTime())) return null;
  const ist = new Date(date.getTime()+istSeconds*1000).toISOString();
  return ist.startsWith(value) ? date : null;
}

export function localReadingTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(Date.parse(timestamp)+istSeconds*1000);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0,16) : '';
}
