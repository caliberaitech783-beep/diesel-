const masterGroup = document.querySelector('.master-group');
const search = document.querySelector('#master-search');
const status = document.querySelector('#search-status');
const list = document.querySelector('#master-list');
const words = value => value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
const entries = [...list.children].map(item => ({
  item,
  name: words(item.textContent),
  fields: words(item.dataset.fields),
}));
search.hidden = false;

function filterMasters() {
  const query = words(search.value);
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
  const count = byName.length + byField.length;
  status.textContent = !query.length ? '' : count ? count + (count === 1 ? ' matching master' : ' matching masters') : 'No matching masters';
  if (query.length) masterGroup.open = true;
}

search.addEventListener('input', filterMasters);
search.addEventListener('keydown', event => {
  if (event.key === 'Escape' && search.value) {
    event.preventDefault();
    search.value = '';
    filterMasters();
  } else if (event.key === 'Enter' && words(search.value).length) {
    list.querySelector('li:not([hidden]) a')?.click();
  }
});
