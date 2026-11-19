const esc = text => String(text ?? '').replace(/[&<>"']/g, value => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
})[value]);

export function masterSiteMenu(actor, prefix, view, master = '') {
  if (!prefix) return '';
  if (actor.masterSites.length === 1) return `<p class="record-meta">Site · ${esc(actor.site)}</p>`;
  const sites = actor.masterSites.map(grant => `<option value="${esc(grant.site)}"${grant.site === actor.site ? ' selected' : ''}>${esc(grant.site)}</option>`).join('');
  return `<form class="record-tools" method="post" action="${prefix}/site">
    <input type="hidden" name="view" value="${view}"><input type="hidden" name="master" value="${esc(master)}">
    <label>Master Data site <select name="site">${sites}</select></label><button>Switch site</button>
  </form>`;
}
