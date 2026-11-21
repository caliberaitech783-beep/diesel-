const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);

export function masterDataSearch({ master, action, search = '', status }) {
  return `<form class="master-data-search" role="search" aria-label="Search ${escape(master.name)}" method="get" action="${escape(action)}">
    <input type="hidden" name="master" value="${master.slug}">
    <input type="search" name="q" value="${escape(search)}" maxlength="256" placeholder="Search records" aria-label="Search ${escape(master.name)}">
    ${status === undefined ? '' : `<select name="status" aria-label="Record status">${['', 'pending', 'approved', 'returned', 'pending_deactivation', 'pending_deletion', 'inactive'].map(value =>
      `<option value="${value}"${status === value ? ' selected' : ''}>${value.replace('_', ' ') || 'All statuses'}</option>`).join('')}</select>`}
    <button type="submit" aria-label="Find records" title="Search">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg>
    </button>
  </form>`;
}
