// The ☰ beside a page title shows and hides the menu on the left, when the page carries one.
const sidebar = document.querySelector('#masters-sidebar');
const toggle = document.querySelector('[data-sidebar-toggle]');
if (sidebar && toggle) {
  const label = () => {
    const text = sidebar.hidden ? 'Show menu' : 'Hide menu';
    toggle.title = text; toggle.setAttribute('aria-label', text); toggle.setAttribute('aria-expanded', String(!sidebar.hidden));
  };
  toggle.setAttribute('role', 'button');
  toggle.setAttribute('aria-controls', 'masters-sidebar');
  toggle.addEventListener('click', event => { event.preventDefault(); sidebar.hidden = !sidebar.hidden; label(); });
  label();
}
