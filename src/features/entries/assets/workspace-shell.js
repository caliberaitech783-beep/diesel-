// Search box (Ctrl + K) and the date and clock in the top bar.
const dialog = document.querySelector('#global-search');
const opener = document.querySelector('#global-search-open');
if (dialog && typeof dialog.showModal === 'function') {
  const input = dialog.querySelector('#global-search-input');
  const items = [...dialog.querySelectorAll('#global-search-results li')];
  const empty = dialog.querySelector('#global-search-empty');
  const filter = () => {
    const words = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    let first = null;
    for (const item of items) {
      const text = item.textContent.toLowerCase();
      item.hidden = !words.every(word => text.includes(word));
      item.classList.remove('is-first');
      if (!item.hidden && !first) first = item;
    }
    if (first && words.length) first.classList.add('is-first');
    empty.hidden = Boolean(first);
    return first;
  };
  const open = () => { if (!dialog.open) { input.value = ''; filter(); dialog.showModal(); input.focus(); } };
  if (opener) { opener.hidden = false; opener.addEventListener('click', open); }
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); open(); }
  });
  input.addEventListener('input', filter);
  // Enter opens the first match.
  dialog.querySelector('form').addEventListener('submit', event => {
    event.preventDefault();
    const first = filter();
    if (first) location.assign(first.querySelector('a').href);
  });
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
}
const clock = document.querySelector('#today-clock');
if (clock) {
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

// ---- Saved entries in the search box: number, supplier or vehicle, fetched as you type.
if (dialog && typeof dialog.showModal === 'function') {
  const input = dialog.querySelector('#global-search-input'), empty = dialog.querySelector('#global-search-empty');
  const records = document.createElement('ul');
  records.id = 'global-search-records';
  dialog.querySelector('#global-search-results').after(records);
  let timer = 0, asked = '';
  const show = list => {
    records.replaceChildren(...list.map(found => {
      const item = document.createElement('li'), link = document.createElement('a'), name = document.createElement('b'), detail = document.createElement('small');
      link.href = found.href; name.textContent = found.number + ' · ' + found.name; detail.textContent = found.detail;
      link.append(name, detail); item.append(link);
      return item;
    }));
    if (list.length) empty.hidden = true;
  };
  input.addEventListener('input', () => {
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
  // Enter opens the first saved entry when no page matches.
  dialog.querySelector('form').addEventListener('submit', () => {
    const page = dialog.querySelector('#global-search-results li:not([hidden])'), record = records.querySelector('a');
    if ((!page || !input.value.trim()) && record) location.assign(record.href);
  });
}

// ---- Bell: how much is waiting for this person.
const bell = document.querySelector('#pending-bell');
if (bell) fetch('/entries/pending.json', { headers: { Accept: 'application/json' } }).then(response => response.ok ? response.json() : null).then(waiting => {
  if (!waiting) return;
  bell.hidden = false;
  bell.querySelector('#pending-count').textContent = waiting.total ? String(waiting.total) : '';
  bell.classList.toggle('has-work', waiting.total > 0);
  bell.title = waiting.total ? waiting.approvals + ' approvals to give · ' + waiting.returned + ' returned to you' : 'Nothing is waiting for you';
  if (!waiting.approvals && waiting.returned) bell.href = '/entries?status=Returned';
}).catch(() => {});

// ---- Favourites and recently opened, kept on this device.
const read = key => { try { return JSON.parse(localStorage.getItem(key)) ?? []; } catch { return []; } };
const write = (key, list) => { try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* Nothing is remembered on this device. */ } };
const here = location.pathname + location.search;
const heading = (document.querySelector('main h1')?.textContent ?? document.title).trim();
if (location.pathname.startsWith('/entries/record/')) {
  const number = document.querySelector('main .bar strong')?.textContent.split(' · ')[0].trim();
  if (number && number !== 'New draft') write('diesel-recent', [{ href: location.pathname, title: number + ' · ' + heading }, ...read('diesel-recent').filter(row => row.href !== location.pathname)].slice(0, 8));
}
const favourite = document.querySelector('#favourite-toggle');
if (favourite && !location.pathname.startsWith('/entries/new/')) {
  const pinned = () => read('diesel-favourites').some(row => row.href === here);
  const paint = () => { const on = pinned(); favourite.setAttribute('aria-pressed', String(on)); favourite.textContent = on ? '★ Favourite' : '☆ Favourite'; };
  favourite.hidden = false;
  paint();
  favourite.addEventListener('click', () => {
    const list = read('diesel-favourites');
    write('diesel-favourites', pinned() ? list.filter(row => row.href !== here) : [{ href: here, title: heading }, ...list].slice(0, 12));
    paint();
  });
}
const shortcuts = document.querySelector('#dash-shortcuts');
if (shortcuts) {
  const fill = (id, list, none) => {
    const target = shortcuts.querySelector(id);
    target.replaceChildren(...(list.length ? list : [{ title: none }]).map(row => {
      const item = document.createElement('li');
      if (row.href && row.href.startsWith('/')) { const link = document.createElement('a'); link.href = row.href; link.textContent = row.title; item.append(link); }
      else { item.textContent = row.title; item.className = 'none'; }
      return item;
    }));
  };
  fill('#favourite-pages', read('diesel-favourites'), 'Press ☆ Favourite on any page to keep it here.');
  fill('#recent-records', read('diesel-recent'), 'Records you open will show here.');
  shortcuts.hidden = false;
}

// ---- Print
const print = document.querySelector('#print-page');
if (print) { print.hidden = false; print.addEventListener('click', () => window.print()); }

// ---- Keyboard: Enter moves to the next field instead of saving a half-filled form.
const entryForm = document.querySelector('#entry-form');
if (entryForm) {
  const fields = () => [...entryForm.querySelectorAll('input:not([type=hidden]):not([type=file]):not([type=checkbox]):not([type=radio]), select, textarea')]
    .filter(field => !field.disabled && !field.readOnly && field.offsetParent !== null);
  entryForm.addEventListener('keydown', event => {
    const field = event.target;
    if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || !field.matches('input, select') || field.matches('[type=submit], [type=button], [list]')) return;
    const list = fields(), next = list[list.indexOf(field) + 1];
    if (!next) return;
    event.preventDefault();
    next.focus();
  });
  // A new entry opens ready to type in its first empty field.
  if (entryForm.dataset.rev === '0' && !document.querySelector(':focus:not(body)')) fields().find(field => !field.value && field.tagName !== 'SELECT')?.focus({ preventScroll: true });
}
