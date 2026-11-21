const search = document.querySelector('#master-search');
const status = document.querySelector('#search-status');
const words = value => value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
const sections = [...document.querySelectorAll('.master-group')].map(group => {
  const list = group.querySelector('ul');
  const entries = [...list.children].map(item => ({
    item,
    name: words(item.textContent),
    fields: words(item.dataset.fields),
  }));
  return { group, list, entries };
});
let lastOpen = sections.find(section => section.group.open) ?? sections[0];
function activeSection() {
  lastOpen = sections.find(section => section.group.open) ?? lastOpen;
  return lastOpen;
}
search.hidden = false;

function filterList({ list, entries }, query) {
  const byName = [];
  const byField = [];
  const hidden = [];
  for (const entry of entries) {
    const matches = terms => query.every(word => terms.some(term => term.startsWith(word)));
    const group = matches(entry.name) ? byName : matches([...entry.name, ...entry.fields]) ? byField : hidden;
    entry.item.hidden = group === hidden;
    group.push(entry.item);
  }
  list.append(...byName, ...byField, ...hidden);
  return byName.length + byField.length;
}

function filterMasters() {
  const query = words(search.value);
  const active = activeSection();
  let count;
  for (const section of sections) {
    const matches = filterList(section, query);
    if (section === active) count = matches;
  }
  status.textContent = !query.length ? '' : count ? count + (count === 1 ? ' matching master' : ' matching masters') : 'No matching masters';
  if (query.length) active.group.open = true;
}

search.addEventListener('input', filterMasters);
search.addEventListener('keydown', event => {
  if (event.key === 'Escape' && search.value) {
    event.preventDefault();
    search.value = '';
    filterMasters();
  } else if (event.key === 'Enter' && words(search.value).length) {
    activeSection().list.querySelector('li:not([hidden]) a')?.click();
  }
});

// Record counts beside each Master Data link, where the signed-in workspace provides them.
const counted = document.querySelector('#master-data-list[data-counts]');
if (counted) {
  fetch(counted.dataset.counts, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
    .then(response => response.ok ? response.json() : null)
    .then(counts => {
      if (!counts) return;
      for (const link of counted.querySelectorAll('a[href*="master="]')) {
        const url = new URL(link.href);
        const count = (url.pathname === '/pulse-masters' ? counts.pulse : counts.masters)?.[url.searchParams.get('master')];
        if (!Number.isInteger(count)) continue;
        const badge = document.createElement('span');
        badge.className = 'master-count';
        badge.textContent = count;
        badge.setAttribute('aria-label', count + (count === 1 ? ' record' : ' records'));
        link.append(' ', badge);
      }
    })
    .catch(() => {});
}
