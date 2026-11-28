// The PO indent combobox uses only the approved, site-scoped choices rendered by the server.
const words = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export function filterOrderIndents(rows, query) {
  const terms = words(query).split(/\s+/).filter(Boolean);
  return rows.filter(row => {
    const text = words([row.label, row.site, row.day, row.remarks, row.remaining].join(' '));
    return terms.every(term => text.includes(term));
  });
}

const form = typeof document === 'undefined' ? null : document.querySelector('#entry-form[data-type="E2"]');
const picker = form?.querySelector('[data-order-indents]');
if (picker) {
  const box = picker.querySelector('[data-search-for="indent"]'), hidden = form.elements.indent;
  const toggle = picker.querySelector('[data-indent-toggle]'), list = picker.querySelector('[role="listbox"]');
  const status = picker.querySelector('[data-indent-status]'), site = form.querySelector('[data-order-site]');
  const location = form.querySelector('[data-order-location]');
  const rows = JSON.parse(picker.dataset.orderIndents || '[]');
  const scoped = () => (!site || site.value === picker.dataset.indentSite) && Boolean(picker.dataset.indentSite)
    && (!location || !site?.selectedOptions[0]?.dataset.location || location.value === site.selectedOptions[0].dataset.location);
  const figure = value => Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  let matches = [], active = -1, selecting = false;
  const selected = () => rows.find(row => row.value === hidden.value);
  const summary = () => {
    const row = selected();
    status.textContent = !scoped() ? 'Select a site to see its approved indents.' : row
      ? 'Approved · ' + figure(row.litres) + ' L sanctioned · ' + figure(row.remaining) + ' L available'
      : rows.length ? rows.length + ' approved indent' + (rows.length === 1 ? '' : 's') + ' for ' + picker.dataset.indentSite + ' only'
      : 'No approved indents with an available balance for this site.';
  };
  const close = () => { list.hidden = true; box.setAttribute('aria-expanded', 'false'); box.removeAttribute('aria-activedescendant'); active = -1; };
  const setValue = row => {
    hidden.dataset.remaining = String(row?.remaining ?? '');
    if (hidden.value !== (row?.value ?? '')) {
      hidden.value = row?.value ?? '';
      hidden.dispatchEvent(new Event('input', { bubbles: true }));
      hidden.dispatchEvent(new Event('change', { bubbles: true }));
    }
    summary();
  };
  const choose = row => {
    box.value = row.label;
    box.setCustomValidity('');
    setValue(row); close(); box.focus({ preventScroll: true });
    selecting = true;
    box.dispatchEvent(new Event('input', { bubbles: true }));
    selecting = false;
  };
  const highlight = at => {
    active = at;
    const options = [...list.querySelectorAll('[role="option"]')];
    options.forEach((option, index) => option.setAttribute('aria-selected', String(index === active)));
    if (options[at]) { box.setAttribute('aria-activedescendant', options[at].id); options[at].scrollIntoView({ block: 'nearest' }); }
    else box.removeAttribute('aria-activedescendant');
  };
  const show = (all = false) => {
    if (!scoped() || box.disabled) { close(); summary(); return; }
    matches = filterOrderIndents(rows, all || selected()?.label === box.value ? '' : box.value);
    list.replaceChildren();
    for (const [index, row] of matches.entries()) {
      const option = document.createElement('li');
      option.id = 'order-indent-option-' + index;
      option.setAttribute('role', 'option'); option.setAttribute('aria-selected', 'false');
      const number = document.createElement('strong'), detail = document.createElement('span');
      number.textContent = row.label;
      detail.textContent = row.day.split('-').reverse().join('/') + ' · ' + figure(row.remaining) + ' L available';
      option.append(number, detail);
      option.addEventListener('pointerdown', event => event.preventDefault());
      option.addEventListener('click', () => choose(row));
      list.append(option);
    }
    if (!matches.length) {
      const empty = document.createElement('li'); empty.className = 'po-indent-empty';
      empty.textContent = rows.length ? 'No matching approved indents at this site.' : 'No approved indents with an available balance at this site.';
      list.append(empty);
    }
    list.hidden = false; box.setAttribute('aria-expanded', 'true');
    highlight(-1);
  };
  box.addEventListener('input', () => {
    const exact = scoped() && rows.find(row => row.label.toLowerCase() === box.value.trim().toLowerCase());
    box.setCustomValidity(box.value.trim() && !exact ? 'Select an approved indent from this site’s list.' : '');
    setValue(exact || null);
    if (!selecting) show();
  });
  box.addEventListener('field-picker-open', () => show(true));
  toggle.addEventListener('click', () => { if (list.hidden) { box.focus(); show(true); } else close(); });
  box.addEventListener('keydown', event => {
    if (event.key === 'Escape') { close(); event.preventDefault(); }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); if (list.hidden) show(true);
      highlight(!matches.length ? -1 : active < 0 ? (event.key === 'ArrowDown' ? 0 : matches.length - 1)
        : (active + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length);
    } else if (event.key === 'Enter' && !list.hidden) {
      event.preventDefault();
      const row = matches[active < 0 ? 0 : active];
      if (row) choose(row);
    } else if (event.key === 'Tab') close();
  });
  document.addEventListener('pointerdown', event => { if (!picker.contains(event.target)) close(); });
  picker.addEventListener('focusout', event => { if (!picker.contains(event.relatedTarget)) close(); });
  for (const control of [site, location]) control?.addEventListener('change', () => {
    if (scoped()) { box.disabled = toggle.disabled = false; summary(); return; }
    close(); box.value = ''; box.setCustomValidity(''); box.disabled = toggle.disabled = true;
    setValue(null);
  });
  summary();
}
