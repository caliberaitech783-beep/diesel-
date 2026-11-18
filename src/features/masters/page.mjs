import { masters } from './catalog.mjs';
import { masterForm } from './master-form.mjs';
import { masterSidebar } from './master-sidebar.mjs';
import { mastersMenuLink } from './master-navigation.mjs';
import { themeHead, themeToggle } from '../theme/theme-toggle.mjs';

export function mastersPage({ master, account, guest }) {
  const selected = masters.find(entry => entry.slug === master);
  const heading = selected?.name ?? 'Choose a master';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${heading} · Diesel</title>
  <link rel="icon" href="/masters/assets/pulse.png">
  ${themeHead}
  <link rel="stylesheet" href="/masters/assets/workspace.css">
  ${selected ? '<link rel="stylesheet" href="/masters/assets/master-form.css"><script type="module" src="/masters/assets/master-form.js"></script>' : ''}
  ${selected ? '' : '<script type="module" src="/masters/assets/navigation.js"></script>'}
</head>
<body${guest ? ' data-access-mode="guest"' : ''}>
  <a class="skip" href="#workspace">Skip to workspace</a>
  <header class="masthead">
    <div class="brand">
      <img src="/masters/assets/pulse.png" width="36" height="36" alt="">
      <span class="wordmark">Caliber <strong>Pulse</strong></span>
      <span class="product">Diesel</span>
    </div>
    <div class="account">${themeToggle}${account}</div>
  </header>
  <div class="layout">
    ${selected ? '' : masterSidebar()}
    <main id="workspace" tabindex="-1" aria-labelledby="workspace-title">
      ${selected ? mastersMenuLink('/') : ''}
      <header class="workspace-heading">
        <h1 id="workspace-title">${heading}</h1>
        ${selected ? '<p class="required-key"><span class="required-mark" aria-hidden="true">*</span> Required fields</p>' : ''}
      </header>
      ${selected ? masterForm(selected) : ''}
    </main>
  </div>
</body>
</html>`;
}
