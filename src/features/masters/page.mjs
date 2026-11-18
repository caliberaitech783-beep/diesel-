import { masters } from './catalog.mjs';
import { masterForm } from './master-form.mjs';
import { masterSidebar } from './master-sidebar.mjs';
import { themeHead, themeToggle } from '../theme/theme-toggle.mjs';

export function mastersPage({ master, account, guest }) {
  const requested = masters.find(entry => entry.slug === master);
  const selected = requested ?? masters[0];
  const form = masterForm(selected);
  const sidebar = masterSidebar({ selectedSlug: selected.slug, collapsed: Boolean(requested) });

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${selected.name} · Diesel</title>
  <link rel="icon" href="/masters/assets/pulse.png">
  ${themeHead}
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
    <div class="account">${sidebar.toggle}${themeToggle}${account}</div>
  </header>
  <div class="layout">
    ${sidebar.panel}
    <main id="workspace" tabindex="-1" aria-labelledby="workspace-title">
      <header class="workspace-heading">
        <h1 id="workspace-title">${selected.name}</h1>
        <p class="required-key"><span class="required-mark" aria-hidden="true">*</span> Required fields</p>
      </header>
      ${form}
    </main>
  </div>
</body>
</html>`;
}
