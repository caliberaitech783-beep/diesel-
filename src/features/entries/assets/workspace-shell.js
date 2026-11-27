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
