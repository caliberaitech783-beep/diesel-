// The menu on the left of a master page. "Hide menu" sits at the top of the menu; the ☰ beside the page title shows it
// again. Choosing something from the menu closes it for the next page. The choice is remembered on this device and
// shared with the entry pages.
const sidebar = document.querySelector('#masters-sidebar');
const toggle = document.querySelector('[data-sidebar-toggle]');
if (sidebar && toggle) {
  const hide = sidebar.querySelector('[data-sidebar-hide]');
  const remember = hidden => { try { localStorage.setItem('diesel-menu', hidden ? 'hidden' : 'shown'); } catch { /* The choice simply lasts for this page. */ } };
  const apply = hidden => {
    sidebar.hidden = hidden;
    document.documentElement.dataset.menu = hidden ? 'hidden' : 'shown';
    const text = hidden ? 'Show menu' : 'Hide menu';
    toggle.title = text; toggle.setAttribute('aria-label', text); toggle.setAttribute('aria-expanded', String(!hidden));
    // With "Hide menu" inside the menu, the ☰ beside the title is only needed while the menu is hidden.
    if (hide) toggle.hidden = !hidden;
  };
  toggle.setAttribute('role', 'button');
  toggle.setAttribute('aria-controls', 'masters-sidebar');
  toggle.addEventListener('click', event => { event.preventDefault(); const hidden = !sidebar.hidden; remember(hidden); apply(hidden); });
  if (hide) { hide.hidden = false; hide.addEventListener('click', () => { remember(true); apply(true); toggle.focus(); }); }
  sidebar.addEventListener('click', event => { if (event.target.closest('a[href]')) remember(true); });
  // A page that the server opens with its menu hidden stays so; otherwise the remembered choice decides.
  apply(sidebar.hidden || document.documentElement.dataset.menu === 'hidden');
}
