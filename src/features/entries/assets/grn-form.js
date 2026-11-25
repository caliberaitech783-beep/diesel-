// Live behaviour for the GRN form: material and storage rows, discrepancy, amounts and totals.
const form = document.querySelector('#entry-form');
const tables = form ? [...form.querySelectorAll('[data-grn-rows]')] : [];
if (tables.length) {
  const number = value => Number(value) || 0;
  const two = value => value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const show = (name, value) => { const out = form.querySelector('[data-grn="' + name + '"]'); if (out) out.textContent = two(value); };
  const cell = (row, name) => row.querySelector('[data-col="' + name + '"]');
  function refresh() {
    let quantity = 0, amount = 0, allocated = 0;
    for (const table of tables) {
      const rows = [...table.tBodies[0].rows], store = form.querySelector('[name="' + table.dataset.grnRows + '"]');
      rows.forEach((row, index) => { row.cells[0].textContent = index + 1; });
      if (table.dataset.grnRows === 'materials') {
        store.value = JSON.stringify(rows.map(row => {
          const invoice = number(cell(row, 'invoiceQty').value), received = number(cell(row, 'receivedQty').value), rate = number(cell(row, 'rate').value);
          cell(row, 'discrepancy').textContent = !invoice && !received ? '' : received > invoice ? 'Excess' : received < invoice ? 'Shortage' : 'No Discrepancy';
          cell(row, 'amount').textContent = received * rate ? two(received * rate) : '';
          quantity += received; amount += received * rate;
          return { material: cell(row, 'material').value, invoiceQty: cell(row, 'invoiceQty').value, receivedQty: cell(row, 'receivedQty').value, rate: cell(row, 'rate').value };
        }).filter(row => row.invoiceQty !== '' || row.receivedQty !== '' || row.rate !== ''));
      } else {
        store.value = JSON.stringify(rows.map(row => {
          allocated += number(cell(row, 'litres').value);
          return { storage: cell(row, 'storage').value, litres: cell(row, 'litres').value };
        }).filter(row => row.storage || row.litres !== ''));
      }
    }
    show('totalQty', quantity); show('totalAmount', amount); show('allocatedQty', allocated);
  }
  form.addEventListener('click', event => {
    const add = event.target.closest('[data-add-row]'), remove = event.target.closest('[data-remove-row]');
    if (add) {
      const table = tables.find(item => item.dataset.grnRows === add.dataset.addRow);
      table.tBodies[0].append(table.parentElement.querySelector('template').content.cloneNode(true));
    } else if (remove) {
      const body = remove.closest('tbody');
      if (body.rows.length > 1) remove.closest('tr').remove();
      else for (const control of remove.closest('tr').querySelectorAll('input')) control.value = '';
    } else return;
    refresh();
  });
  form.addEventListener('input', refresh);
  form.addEventListener('change', refresh);
  // The hidden row fields must be current before the shared form script reads them on submit.
  form.addEventListener('submit', refresh, true);
  refresh();
}
