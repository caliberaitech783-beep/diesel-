import { createLiveRefresh } from './live-refresh.mjs';

const records = document.querySelector('[data-live-records]');
if (records) {
  let localChange = false;
  const errorMessage = document.createElement('p');
  errorMessage.className = 'live-refresh-error';
  errorMessage.setAttribute('role', 'status');
  records.before(errorMessage);

  const refresh = createLiveRefresh({
    visible: () => document.visibilityState === 'visible' && navigator.onLine,
    async load() {
      const response = await fetch(location.href, {
        cache: 'no-store', credentials: 'same-origin', redirect: 'error',
        headers: { Accept: 'text/html' }, signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error('Records could not be updated. Retrying automatically.');
      const page = new DOMParser().parseFromString(await response.text(), 'text/html');
      const updated = page.querySelector('[data-live-records]');
      if (!updated || updated.dataset.liveScope !== records.dataset.liveScope) {
        throw new Error('Your account or site changed. Reopen this master to continue.');
      }
      return updated;
    },
    apply(updated) {
      // Search, site selection, imports, file menus and drafts stay outside this region.
      // Preserve table scrolling and keyboard focus, and leave identical rows untouched.
      const tables = [...records.querySelectorAll('.master-data-table, .record-list')];
      const focusedTable = tables.indexOf(document.activeElement);
      const focusedLink = localChange && records.contains(document.activeElement) ? document.activeElement.closest('a')?.getAttribute('href') : null;
      if ((localChange || !records.contains(document.activeElement) || focusedTable >= 0) && records.innerHTML !== updated.innerHTML) {
        const positions = tables
          .map(table => ({ left: table.scrollLeft, top: table.scrollTop }));
        records.replaceChildren(...updated.childNodes);
        records.querySelectorAll('.master-data-table, .record-list').forEach((table, index) => {
          table.scrollLeft = positions[index]?.left ?? 0;
          table.scrollTop = positions[index]?.top ?? 0;
          if (index === focusedTable) table.focus({ preventScroll: true });
        });
        if (focusedLink) [...records.querySelectorAll('a')].find(link=>link.getAttribute('href')===focusedLink)?.focus({preventScroll:true});
      }
      localChange = false;
      errorMessage.textContent = '';
    },
    onError(error) {
      errorMessage.textContent = error.message;
    },
  });
  document.addEventListener('visibilitychange', refresh.refresh);
  window.addEventListener('focus', refresh.refresh);
  window.addEventListener('master-record-changed', () => { localChange = true; refresh.refresh(); });
  window.addEventListener('online', refresh.refresh);
  window.addEventListener('pagehide', () => refresh.stop(), { once: true });
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
}
