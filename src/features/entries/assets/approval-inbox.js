// Approve or return an entry straight from the approvals inbox.
for (const card of document.querySelectorAll('.approval-card')) {
  const form = card.querySelector('form'), status = card.querySelector('output');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const action = event.submitter?.value, reason = form.elements.reason.value.trim();
    if (action === 'Return' && !reason) { status.textContent = 'Give a return reason.'; form.elements.reason.focus(); return; }
    const buttons = [...form.querySelectorAll('button')];
    buttons.forEach(button => button.disabled = true);
    try {
      const response = await fetch('/entries/record/' + card.dataset.id, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ action, reason, rev: Number(card.dataset.rev), token: crypto.randomUUID(),
          actor: document.body.dataset.actor, offlineScope: document.body.dataset.offlineScope || undefined }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not save this action.');
      card.classList.add('done');
      form.replaceChildren(Object.assign(document.createElement('p'), {
        className: 'approval-done', textContent: (action === 'Approve' ? 'Approved' : 'Returned') + ' · ' + result.status }));
    } catch (error) {
      status.textContent = error.message;
      buttons.forEach(button => button.disabled = false);
    }
  });
}
