import { masters } from './catalog.mjs';
import { masterForm } from './master-form.mjs';

export function mastersPage({ master, account, guest }) {
  const selected = masters.find(entry => entry.slug === master) ?? masters[0];
  const form = masterForm(selected);
  const links = masters.map(({ name, slug, sections }) =>
    `<li data-fields="${sections.flatMap(section => section.fields.map(field => field.label)).join(' ').replace(/[^\p{L}\p{N} ]/gu, ' ')}"><a href="?master=${slug}"${slug === selected.slug ? ' aria-current="page"' : ''}>${name}</a></li>`
  ).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${selected.name} · Diesel</title>
  <link rel="icon" href="/masters/assets/pulse.png">
  <link rel="stylesheet" href="/masters/assets/workspace.css">
  <link rel="stylesheet" href="/masters/assets/master-form.css">
  <script type="module" src="/masters/assets/master-form.js"></script>
  <script type="module" src="/masters/assets/navigation.js"></script>
</head>
<body${guest ? ' data-access-mode="guest"' : ''}>
  <a class="skip" href="#workspace">Skip to workspace</a>
  <header class="masthead">
    <div class="brand">
      <img src="/masters/assets/pulse.png" width="36" height="36" alt="">
      <span class="wordmark">Caliber <strong>Pulse</strong></span>
      <span class="product">Diesel</span>
    </div>
    <div class="account">${account}</div>
  </header>
  <div class="layout">
    <aside class="sidebar">
      <div class="sidebar-tools">
        <a class="back-to-pulse" href="https://pulse.cmll.in/"><span aria-hidden="true">←</span> Back to Pulse</a>
        <input id="master-search" type="search" placeholder="Search masters or fields" aria-label="Search masters or fields" aria-controls="master-list" autocomplete="off" hidden>
        <p id="search-status" role="status"></p>
      </div>
      <nav aria-label="Diesel navigation">
        <details class="master-group" open>
          <summary><span class="folder-icon" aria-hidden="true"></span>Master</summary>
          <ul id="master-list" aria-label="Master subtabs">${links}</ul>
        </details>
      </nav>
    </aside>
    <main id="workspace" tabindex="-1" aria-labelledby="workspace-title">
      <h1 id="workspace-title">${selected.name}</h1>
      ${form}
    </main>
  </div>
</body>
</html>`;
}
