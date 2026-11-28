// Diesel Workspace: every entry as a card under its category heading, in the order the work is done.
// Each card names the module, opens its register, and can start a new entry.
import { page } from './entry-shell.mjs';
import { entryModuleCards } from './entry-module-cards.mjs';

export function workspacePage(actor) {
  const heading = '<div class="ws-heading"><h1>Workspace</h1></div>';
  return page('Workspace', actor, 'workspace', '/entries/workspace', entryModuleCards(actor), heading);
}
