// Preview of many imported records. Each row is saved for review through the same check as the record form.
const section = document.querySelector('#bulk-import');

function cell(row, content) {
  const element = row.insertCell();
  if (typeof content === 'string') element.textContent = content; else element.append(...content);
  return element;
}

function recordBody(values, scope) {
  const body = { values: {}, scope };
  for (const [key, value] of values) {
    if (key !== 'Dated attributes') { body.values[key] = value; continue; }
    try { body.attributes = JSON.parse(value); } catch { throw new Error('Use the dated attributes column from a Diesel export.'); }
  }
  return body;
}

export function showBulkImport({ records, unused, sheet, file, api, scope, recordHome, codeField, openInForm }) {
  const summary = section.querySelector('[data-bulk-summary]'), body = section.querySelector('tbody');
  const save = section.querySelector('[data-bulk-save]'), cancel = section.querySelector('[data-bulk-cancel]');
  const describe = text => { summary.textContent = text; };
  const source = file + (sheet ? ' · sheet ' + sheet : '');
  describe(records.length + ' records found in ' + source + '. Nothing is saved yet.'
    + (unused.length ? ' Columns not used: ' + unused.join(', ') + '.' : ''));
  body.replaceChildren();
  const results = records.map(record => {
    const row = body.insertRow(), values = new Map(record.values);
    cell(row, String(record.row));
    cell(row, values.get(codeField) ?? record.values[0][1]);
    return cell(row, 'Ready');
  });
  save.hidden = false;
  save.disabled = cancel.disabled = false;
  save.textContent = 'Save ' + records.length + ' records for review';
  cancel.textContent = 'Cancel';
  cancel.onclick = () => { section.hidden = true; body.replaceChildren(); };
  save.onclick = async () => {
    save.disabled = cancel.disabled = true;
    let saved = 0;
    for (const [index, record] of records.entries()) {
      const result = results[index];
      if (result.dataset.saved) { saved++; continue; }
      result.textContent = 'Saving…';
      describe('Saving record ' + (index + 1) + ' of ' + records.length + '…');
      try {
        const response = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(recordBody(record.values, scope)) });
        const answer = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(answer.error || 'The record could not be saved.');
        const link = document.createElement('a');
        link.href = recordHome + '&id=' + encodeURIComponent(answer.id);
        link.textContent = 'Saved for review';
        result.replaceChildren(link);
        result.dataset.saved = 'true';
        saved++;
      } catch (error) {
        const open = document.createElement('button');
        open.type = 'button';
        open.textContent = 'Open in form';
        open.addEventListener('click', () => openInForm(record.values));
        result.replaceChildren(error.message + ' ', open);
      }
    }
    const failed = records.length - saved;
    describe(saved + ' of ' + records.length + ' records saved for review.'
      + (failed ? ' ' + failed + ' need a correction or an attachment: open each in the form, or fix the file and import it again.' : ''));
    cancel.disabled = false;
    cancel.textContent = 'Close';
    save.hidden = !failed;
    save.disabled = false;
    save.textContent = 'Try the remaining ' + failed + ' again';
  };
  section.hidden = false;
  section.scrollIntoView({ block: 'nearest' });
}
