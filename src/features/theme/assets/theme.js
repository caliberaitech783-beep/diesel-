(() => {
  const key = 'diesel-theme';
  const root = document.documentElement;
  // Dashboard and Workspace reopen their menu; entry pages start collapsed.
  // Apply the page default before styles load, even when storage is blocked.
  if (root.dataset.menuDefault) root.dataset.menu = root.dataset.menuDefault;
  try {
    if (localStorage.getItem(key) === 'dark') root.dataset.theme = 'dark';
    if (!root.dataset.menuDefault && localStorage.getItem('diesel-menu') === 'hidden') root.dataset.menu = 'hidden';
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
