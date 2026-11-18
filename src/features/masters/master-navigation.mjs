export function mastersMenuLink(href, label = 'Back to masters') {
  return `<a class="masters-back navigation-icon" href="${href}" aria-label="${label}" title="${label}">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
      <path d="M5 6h14M5 12h14M5 18h14"/>
    </svg>
  </a>`;
}
