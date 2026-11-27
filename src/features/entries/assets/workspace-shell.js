// What every Diesel page shares: the search box (Ctrl + K), the date and clock, the bell, recent records,
// printing, and the helpers on registers and entry forms. Everything remembered is kept on this device only.
const read = key => { try { return JSON.parse(localStorage.getItem(key)) ?? []; } catch { return []; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Nothing is remembered on this device. */ } };
const forget = key => { try { localStorage.removeItem(key); } catch { /* Nothing was remembered. */ } };
const make = (tag, props = {}, ...children) => { const node = Object.assign(document.createElement(tag), props); node.append(...children); return node; };

// ---- Search: pages, entries and masters from the list on the page; saved entries fetched as you type.
function setupSearch(dialog, opener) {
  if (!dialog || typeof dialog.showModal !== 'function') return;
  const input = dialog.querySelector('#global-search-input'), empty = dialog.querySelector('#global-search-empty');
  const items = [...dialog.querySelectorAll('#global-search-results li')];
  const records = make('ul', { id: 'global-search-records' });
  dialog.querySelector('#global-search-results').after(records);
  const filter = () => {
    const words = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    let first = null;
    for (const item of items) {
      item.hidden = !words.every(word => item.textContent.toLowerCase().includes(word));
      item.classList.remove('is-first');
      if (!item.hidden && !first) first = item;
    }
    if (first && words.length) first.classList.add('is-first');
    empty.hidden = Boolean(first) || records.childElementCount > 0;
    return words.length ? first : null;
  };
  const show = list => {
    records.replaceChildren(...list.map(found => make('li', {}, make('a', { href: found.href },
      make('b', { textContent: found.number + ' · ' + found.name }), make('small', { textContent: found.detail })))));
    filter();
  };
  const open = () => { if (!dialog.open) { input.value = ''; show([]); dialog.showModal(); input.focus(); } };
  if (opener) { opener.hidden = false; opener.addEventListener('click', open); }
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); open(); }
  });
  let timer = 0, asked = '';
  input.addEventListener('input', () => {
    filter();
    clearTimeout(timer);
    const query = input.value.trim();
    if (query.length < 2) { asked = ''; show([]); return; }
    timer = setTimeout(async () => {
      asked = query;
      try {
        const response = await fetch('/entries/search.json?q=' + encodeURIComponent(query), { headers: { Accept: 'application/json' } });
        if (response.ok && asked === query) show(await response.json());
      } catch { /* Pages and masters still match without the network. */ }
    }, 220);
  });
  // Enter opens the first page that matches, or else the first saved entry.
  dialog.querySelector('form').addEventListener('submit', event => {
    event.preventDefault();
    const target = filter()?.querySelector('a') ?? records.querySelector('a');
    if (target) location.assign(target.href);
  });
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
}
function setupClock(clock) {
  if (!clock) return;
  const date = clock.querySelector('#today-date'), time = clock.querySelector('#today-time');
  const tick = () => {
    const now = new Date();
    date.textContent = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    time.textContent = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase();
  };
  tick();
  clock.hidden = false;
  setInterval(tick, 30000);
}
if (document.querySelector('#global-search')) {
  setupSearch(document.querySelector('#global-search'), document.querySelector('#global-search-open'));
  setupClock(document.querySelector('#today-clock'));
} else if (document.querySelector('#masters-sidebar')) {
  // A master page borrows the search box and the clock from the entry pages.
  fetch('/entries/shell-parts.html').then(response => response.ok ? response.text() : '').then(html => {
    const parts = new DOMParser().parseFromString(html, 'text/html').querySelector('#shell-parts')?.content;
    if (!parts) return;
    const opener = parts.querySelector('#global-search-open'), clock = parts.querySelector('#today-clock'), dialog = parts.querySelector('#global-search');
    document.querySelector('#masters-sidebar .sidebar-tools')?.append(opener);
    const account = document.querySelector('.masthead .account'), bell = parts.querySelector('#pending-bell'), helpOpen = parts.querySelector('#help-open'), help = parts.querySelector('#page-help');
    account?.prepend(helpOpen, bell, clock);
    document.body.append(dialog, help);
    setupSearch(dialog, opener);
    setupClock(clock);
    setupBell(bell);
    setupHelp(help, helpOpen);
  }).catch(() => {});
}

// ---- Bell: how much is waiting for this person.
function setupBell(bell) {
  if (!bell) return;
  fetch('/entries/pending.json', { headers: { Accept: 'application/json' } }).then(response => response.ok ? response.json() : null).then(waiting => {
    if (!waiting) return;
    bell.hidden = false;
    bell.querySelector('#pending-count').textContent = waiting.total ? String(waiting.total) : '';
    bell.title = waiting.total ? waiting.approvals + ' approvals to give · ' + waiting.returned + ' returned to you' : 'Nothing is waiting for you';
    if (!waiting.approvals && waiting.returned) bell.href = '/entries?status=Returned';
  }).catch(() => {});
}
// ---- Help: how to use this page.
function setupHelp(help, opener) {
  if (!help || !opener || typeof help.showModal !== 'function') return;
  opener.hidden = false;
  opener.addEventListener('click', () => help.showModal());
  help.addEventListener('click', event => { if (event.target === help) help.close(); });
}
setupBell(document.querySelector('#pending-bell'));
setupHelp(document.querySelector('#page-help'), document.querySelector('#help-open'));

// ---- Recently opened records, for the Dashboard.
const heading = (document.querySelector('main h1')?.textContent ?? document.title).trim();
if (location.pathname.startsWith('/entries/record/')) {
  const number = document.querySelector('main .bar strong')?.textContent.split(' · ')[0].trim();
  if (number && number !== 'New draft') write('diesel-recent', [{ href: location.pathname, title: number + ' · ' + heading }, ...read('diesel-recent').filter(row => row.href !== location.pathname)].slice(0, 8));
}
const shortcuts = document.querySelector('#dash-shortcuts');
if (shortcuts) {
  const fill = (id, list, none) => shortcuts.querySelector(id).replaceChildren(...(list.length ? list : [{ title: none }]).map(row =>
    row.href?.startsWith('/') ? make('li', {}, make('a', { href: row.href, textContent: row.title })) : make('li', { className: 'none', textContent: row.title })));
  fill('#recent-records', read('diesel-recent'), 'Records you open will show here.');
  shortcuts.hidden = false;
}

// ---- Print
const print = document.querySelector('#print-page');
if (print) { print.hidden = false; print.addEventListener('click', () => window.print()); }

// ---- Registers: tick records to export them, choose the columns shown, and get back to the last filters used.
const register = document.querySelector('.register-table');
if (register) {
  const head = register.tHead.rows[0], foot = register.tFoot?.rows[0], body = [...register.tBodies[0].rows];
  const panel = register.closest('section'), tools = make('div', { className: 'register-tools' });
  register.closest('.scroll').before(tools);

  // Tick boxes, and an export of only the ticked records.
  const idOf = row => row.querySelector('a.record-link')?.getAttribute('href').split('/').pop();
  const all = make('input', { type: 'checkbox', title: 'Tick every record listed' });
  all.setAttribute('aria-label', 'Tick every record listed');
  head.prepend(make('th', { className: 'pick' }, all));
  const boxes = body.map(row => {
    const box = make('input', { type: 'checkbox', value: idOf(row) ?? '' });
    box.setAttribute('aria-label', 'Tick this record');
    row.prepend(make('td', { className: 'pick' }, box));
    return box;
  });
  if (foot) foot.cells[0].colSpan += 1;
  const chosen = make('span', { className: 'register-chosen', hidden: true });
  const exports = panel?.querySelectorAll('a.export') ?? [];
  const original = [...exports].map(link => link.getAttribute('href'));
  const refresh = () => {
    const ids = boxes.filter(box => box.checked && box.value).map(box => box.value);
    chosen.hidden = !ids.length;
    chosen.textContent = ids.length + ' ticked · the Export buttons now export only these';
    exports.forEach((link, index) => {
      const url = new URL(original[index], location.origin);
      if (ids.length) url.searchParams.set('ids', ids.join(','));
      link.setAttribute('href', url.pathname + url.search);
    });
    all.checked = ids.length > 0 && ids.length === boxes.length;
  };
  all.addEventListener('change', () => { boxes.forEach(box => { box.checked = all.checked; }); refresh(); });
  boxes.forEach(box => box.addEventListener('change', refresh));

  // Columns: any column after Document can be hidden. The choice is kept for this register.
  const key = 'diesel-columns:' + location.pathname, hiddenNames = new Set(read(key));
  const columns = [...head.cells].map((cell, index) => ({ index, name: cell.textContent.trim(), number: cell.classList.contains('number') })).filter(column => column.index > 2);
  const apply = () => {
    for (const column of columns) {
      const off = hiddenNames.has(column.name);
      head.cells[column.index].hidden = off;
      body.forEach(row => { if (row.cells[column.index]) row.cells[column.index].hidden = off; });
    }
    if (foot) {
      // The total row spans the columns before the figures and after them; keep those spans matching what is shown.
      const firstNumber = columns.find(column => column.number)?.index ?? head.cells.length, lastNumber = columns.findLast(column => column.number)?.index ?? firstNumber;
      const shown = (from, to) => [...head.cells].slice(from, to).filter(cell => !cell.hidden).length;
      foot.cells[0].colSpan = Math.max(1, shown(0, firstNumber));
      [...foot.cells].slice(1, -1).forEach((cell, offset) => { cell.hidden = head.cells[firstNumber + offset]?.hidden ?? false; });
      const tail = foot.cells[foot.cells.length - 1], left = shown(lastNumber + 1, head.cells.length);
      tail.hidden = !left; tail.colSpan = Math.max(1, left);
    }
  };
  const menu = make('details', { className: 'column-menu' }, make('summary', { textContent: 'Columns' }),
    make('div', {}, ...columns.map(column => {
      const box = make('input', { type: 'checkbox', checked: !hiddenNames.has(column.name) });
      box.addEventListener('change', () => { if (box.checked) hiddenNames.delete(column.name); else hiddenNames.add(column.name); write(key, [...hiddenNames]); apply(); });
      return make('label', {}, box, ' ' + column.name);
    })));
  tools.append(menu, chosen);
  apply();

}

// ---- Entry forms.
const entryForm = document.querySelector('#entry-form');
if (entryForm) {
  const visible = field => !field.disabled && !field.readOnly && field.offsetParent !== null;
  const typed = () => [...entryForm.querySelectorAll('input:not([type=hidden]):not([type=file]):not([type=checkbox]):not([type=radio]), select, textarea')]
    .filter(field => field.name && field.form === entryForm && visible(field));
  // Enter moves to the next field instead of saving a half-filled form.
  entryForm.addEventListener('keydown', event => {
    const field = event.target;
    if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || !field.matches('input, select') || field.matches('[type=submit], [type=button], [list]')) return;
    const list = typed(), next = list[list.indexOf(field) + 1];
    if (!next) return;
    event.preventDefault();
    next.focus();
  });
  const fresh = entryForm.dataset.rev === '0';
  // Put values into the fields that are on screen, and let the form's own calculations react.
  const fillIn = values => {
    let filled = 0;
    for (const field of typed()) {
      const value = values[field.name];
      if (value === undefined || value === null || String(value) === field.value) continue;
      if (field.tagName === 'SELECT' && ![...field.options].some(option => option.value === String(value))) continue;
      field.value = String(value);
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
      filled += 1;
    }
    return filled;
  };
  if (fresh) {
    // A new entry opens ready to type in its first empty field.
    if (!document.querySelector(':focus:not(body)')) typed().find(field => !field.value && field.tagName !== 'SELECT')?.focus({ preventScroll: true });

    const note = make('div', { className: 'form-helper', hidden: true });
    entryForm.before(note);
    const say = (text, ...buttons) => { note.replaceChildren(make('span', { textContent: text }), ...buttons); note.hidden = false; };
    const button = (label, action) => { const node = make('button', { type: 'button', textContent: label }); node.addEventListener('click', action); return node; };

    // Autosave: what is typed into a new entry is kept on this device until the entry is saved.
    const draftKey = 'diesel-autosave:' + entryForm.dataset.type + ':' + entryForm.dataset.site;
    const snapshot = () => Object.fromEntries(typed().filter(field => field.value).map(field => [field.name, field.value]));
    // Row tables (purchase order footer rows, goods receipt materials and storage) keep their values in unnamed
    // cells, so they are kept row by row: every table of the form, each row's cells in order.
    const rowTables = () => [...entryForm.querySelectorAll('table')].filter(table => table.querySelector('tbody input:not([type=hidden]), tbody select'));
    const cellsOf = row => [...row.querySelectorAll('input:not([type=hidden]):not([type=file]), select')];
    const rowSnapshot = () => rowTables().map(table => {
      const rows = [...table.querySelectorAll('tbody tr')].map(row => cellsOf(row).map(cell => cell.value));
      while (rows.length && rows.at(-1).every(value => !value)) rows.pop();
      return rows;
    });
    const fillRows = saved => rowTables().forEach((table, place) => {
      const wanted = saved?.[place] ?? [];
      // A table that adds rows on request gets as many as were typed; one that keeps spare rows hidden shows them.
      const add = entryForm.querySelector('[data-add-row="' + (table.dataset.grnRows ?? '') + '"]');
      for (let guard = 0; add && table.querySelectorAll('tbody tr').length < wanted.length && guard < 50; guard += 1) add.click();
      [...table.querySelectorAll('tbody tr')].forEach((row, index) => {
        const values = wanted[index];
        if (!values?.some(Boolean)) return;
        row.hidden = false;
        cellsOf(row).forEach((cell, at) => {
          if (values[at] === undefined || values[at] === cell.value) return;
          if (cell.tagName === 'SELECT' && ![...cell.options].some(option => option.value === values[at])) return;
          cell.value = values[at];
          cell.dispatchEvent(new Event('input', { bubbles: true }));
          cell.dispatchEvent(new Event('change', { bubbles: true }));
        });
      });
    });
    const kept = read(draftKey)[0];
    let saving = 0;
    if (kept?.values && (Object.keys(kept.values).length || kept.rows?.some(table => table.length))) say('You left this entry unsaved on ' + new Date(kept.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) + '.',
      button('Restore what I typed', () => { fillIn(kept.values); fillRows(kept.rows); say('Restored. Check the values, then save.'); }),
      button('Discard', () => { forget(draftKey); note.hidden = true; }));
    entryForm.addEventListener('input', () => {
      clearTimeout(saving);
      saving = setTimeout(() => { const values = snapshot(), rows = rowSnapshot(); if (Object.keys(values).length || rows.some(table => table.length)) write(draftKey, [{ at: Date.now(), values, rows }]); }, 600);
    });
    // entry-form.js clears the kept copy once the entry is saved.
  }
}

if (entryForm) {
  const fields = () => [...entryForm.querySelectorAll('input:not([type=hidden]), select, textarea')].filter(field => field.name && field.offsetParent !== null);
  // A label's own words: a label often wraps its field, so the field and its options are taken out first.
  const labelOf = field => {
    const label = field.labels?.[0]?.cloneNode(true);
    label?.querySelectorAll('input, select, textarea, datalist, small, output').forEach(node => node.remove());
    return (label?.textContent ?? field.getAttribute('aria-label') ?? '').replace(/[*:]/g, ' ').replace(/\s+/g, ' ').trim();
  };

  // ---- A save that fails is shown beside the field it is about, whenever the message names that field.
  const message = document.querySelector('#entry-message');
  const clearMarks = () => { entryForm.querySelectorAll('.field-error').forEach(node => node.remove()); entryForm.querySelectorAll('[aria-invalid="true"]').forEach(field => field.removeAttribute('aria-invalid')); };
  if (message) new MutationObserver(() => {
    clearMarks();
    if (message.dataset.error !== 'true') return;
    const text = message.textContent.replace(/^Not saved:\s*/, ''), lower = text.toLowerCase();
    // The field whose label is named in the message; the longest label wins, so "Delivery date" beats "Date".
    // The field the message is about: every word of its label appears in the message. The longest label wins,
    // so "Delivery date" beats "Date". "No." and "Number" are ignored, as messages often leave them out.
    const words = label => label.toLowerCase().replace(/\(.*?\)/g, ' ').split(/[^a-z0-9]+/).filter(word => word.length > 1 && !['no', 'number', 'the'].includes(word));
    const named = fields().map(field => ({ field, words: words(labelOf(field)) }))
      .filter(found => found.words.length && found.words.every(word => lower.includes(word)))
      .toSorted((a, b) => b.words.join(' ').length - a.words.join(' ').length)[0]?.field;
    if (!named) return;
    named.setAttribute('aria-invalid', 'true');
    named.after(make('small', { className: 'field-error', textContent: text }));
    named.focus({ preventScroll: true });
    named.scrollIntoView({ block: 'center' });
  }).observe(message, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['data-error'] });
  entryForm.addEventListener('input', event => { if (event.target.getAttribute?.('aria-invalid') === 'true') { event.target.removeAttribute('aria-invalid'); event.target.parentElement?.querySelector('.field-error')?.remove(); } });

  // ---- Save and new.
  if (entryForm.dataset.rev === '0') {
    const again = make('input', { type: 'checkbox', id: 'save-and-new', checked: read('diesel-save-and-new')[0] === true });
    again.addEventListener('change', () => write('diesel-save-and-new', [again.checked]));
    const actions = entryForm.querySelector('button[value]')?.closest('.actions') ?? entryForm;
    actions.append(make('label', { className: 'save-and-new' }, again, ' After saving, start another new entry'));
    const saved = new URLSearchParams(location.search).get('saved');
    if (/^[0-9a-f-]{36}$/i.test(saved ?? '')) {
      const note = make('div', { className: 'form-helper saved-note' }, make('span', { textContent: 'Saved. ' }), make('a', { href: '/entries/record/' + saved, textContent: 'Open the entry you just saved' }));
      entryForm.before(note);
    }
  }
}

// ---- Master Data: filter the master cards as you type.
const cardFilter = document.querySelector('#master-card-filter');
if (cardFilter) {
  const cards = [...document.querySelectorAll('#master-cards .master-card')], none = document.querySelector('#master-cards-none');
  cardFilter.hidden = false;
  cardFilter.addEventListener('input', () => {
    const words = cardFilter.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const card of cards) { const text = (card.textContent + ' ' + (card.dataset.fields ?? '')).toLowerCase(); card.hidden = !words.every(word => text.includes(word)); if (!card.hidden) shown += 1; }
    none.hidden = shown > 0;
  });
}

// ---- Data overview: narrow the findings by group, site and words; open or close every check at once.
const checkTools = document.querySelector('#check-tools');
if (checkTools) {
  const cards = [...document.querySelectorAll('#check-list > .check-card')], none = document.querySelector('#check-none');
  const words = checkTools.querySelector('#check-filter'), site = checkTools.querySelector('#check-site'), expand = checkTools.querySelector('#check-expand');
  const groupButtons = [...checkTools.querySelectorAll('.check-groups button')];
  let group = '';
  checkTools.hidden = false;
  const apply = () => {
    const wanted = words.value.trim().toLowerCase().split(/\s+/).filter(Boolean), place = site?.value ?? '', narrowing = wanted.length > 0 || Boolean(place);
    let shown = 0;
    for (const card of cards) {
      let matches = 0;
      for (const item of card.querySelectorAll(':scope > .check-items > li')) {
        item.hidden = (place && item.dataset.site !== place) || !wanted.every(word => item.textContent.toLowerCase().includes(word));
        if (!item.hidden) matches += 1;
      }
      card.hidden = (group && card.dataset.group !== group) || !matches;
      // While narrowing, a check that still has matches opens, so they are in view.
      if (narrowing && !card.hidden) card.open = true;
      if (!card.hidden) shown += 1;
    }
    none.hidden = shown > 0;
  };
  words.addEventListener('input', apply);
  site?.addEventListener('change', apply);
  for (const button of groupButtons) button.addEventListener('click', () => {
    group = button.dataset.group;
    groupButtons.forEach(other => other.setAttribute('aria-pressed', String(other === button)));
    apply();
  });
  expand.addEventListener('click', () => {
    const open = expand.getAttribute('aria-pressed') !== 'true';
    cards.forEach(card => { card.open = open; });
    expand.setAttribute('aria-pressed', String(open));
    expand.textContent = open ? 'Close all' : 'Open all';
  });
  // A summary tile that points at a check opens it.
  const openTarget = () => { const target = document.getElementById(location.hash.slice(1)); if (target?.matches('.check-card')) target.open = true; };
  addEventListener('hashchange', openTarget);
  openTarget();
}

// ---- Diesel Workspace: filter the entry cards as you type; a category with no match is hidden.
const workspaceFilter = document.querySelector('#workspace-filter');
if (workspaceFilter) {
  const groups = [...document.querySelectorAll('.ws-group')], none = document.querySelector('#workspace-none');
  workspaceFilter.hidden = false;
  workspaceFilter.addEventListener('input', () => {
    const words = workspaceFilter.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const group of groups) {
      let inGroup = 0;
      for (const card of group.querySelectorAll('.ws-card')) { card.hidden = !words.every(word => card.dataset.name.includes(word)); if (!card.hidden) inGroup += 1; }
      group.hidden = !inGroup;
      shown += inGroup;
    }
    none.hidden = shown > 0;
  });
}
