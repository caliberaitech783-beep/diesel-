(() => {
  const key = 'diesel-theme';
  const root = document.documentElement;
  try {
    if (localStorage.getItem(key) === 'dark') root.dataset.theme = 'dark';
    // The menu on the left opens hidden when it was last left hidden, or closed by choosing something from it.
    if (localStorage.getItem('diesel-menu') === 'hidden') root.dataset.menu = 'hidden';
  } catch {
    // The switch still works when the browser blocks storage.
  }

  document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.querySelector('.theme-toggle');
    if (!toggle) return;

    const syncToggle = () => {
      const dark = root.dataset.theme === 'dark';
      toggle.setAttribute('aria-checked', String(dark));
      toggle.title = dark ? 'Switch to day theme' : 'Switch to night theme';
    };
    syncToggle();
    toggle.hidden = false;
    toggle.addEventListener('click', () => {
      const theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
      root.dataset.theme = theme;
      syncToggle();
      try {
        localStorage.setItem(key, theme);
      } catch {
        // Keep the current page usable without storage.
      }
    });
  });
})();
