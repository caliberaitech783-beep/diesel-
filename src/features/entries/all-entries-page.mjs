import { page } from './entry-shell.mjs';
import { entryModuleCards } from './entry-module-cards.mjs';

export function allEntriesPage(actor) {
  return page('All entries',actor,'','/entries',entryModuleCards(actor,{newEntries:false}),
    '<div class="ws-heading"><h1>All entries</h1></div>');
}
