export const recordDialogAssets = `<link rel="stylesheet" href="/masters/assets/record-dialog.css"><script type="module" src="/masters/assets/record-dialog.js"></script>`;

export const recordDialogHost = `<dialog class="record-dialog" aria-labelledby="record-dialog-title">
  <header class="record-dialog-heading"><div><p>MASTER DATA</p><h2 id="record-dialog-title">Record details</h2></div><button type="button" data-close-record aria-label="Close record">✕</button></header>
  <p class="record-dialog-loading" role="status">Opening record…</p>
  <iframe title="Master record form"></iframe>
  <section class="record-discard" hidden aria-labelledby="record-discard-title"><h3 id="record-discard-title">Discard unsaved changes?</h3><p>Your changes have not been saved.</p><div><button type="button" data-keep-editing>Keep editing</button><button type="button" data-discard-record>Discard changes</button></div></section>
</dialog><output class="record-dialog-feedback" aria-live="polite"></output>`;

export function deleteConfirmation(privateSubmission) {
  return `<dialog class="record-delete-confirm" aria-labelledby="delete-record-title">
    <form method="dialog"><h2 id="delete-record-title">Delete this record?</h2>
    <p>${privateSubmission ? 'The record will be removed from your Master Data. Its history and attachments will be retained.' : 'This sends a deletion request to your Master Checker. The record leaves Master Data after approval. Its history and attachments will be retained.'}</p>
    <label for="delete-record-reason">Reason for deletion</label><textarea id="delete-record-reason" maxlength="1000" required rows="3"></textarea>
    <div class="delete-confirm-actions"><button value="cancel" formnovalidate>Keep record</button><button type="button" class="record-delete" data-confirm-delete>Confirm deletion</button></div><output aria-live="polite"></output></form>
  </dialog>`;
}
