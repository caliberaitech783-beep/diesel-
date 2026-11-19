const reviewForm = document.querySelector('[data-remote-confirm]');
const invite = document.querySelector('#send-telegram-approval');

async function submitApproval(path, fields, output, buttons) {
  buttons.forEach(button => { button.disabled = true; });
  output.textContent = 'Working…';
  try {
    const response = await fetch(path, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ ...fields, actor: document.body.dataset.actor }),
    });
    if (response.status === 401) throw Error('Sign back in to Pulse and reopen the approval link.');
    const result = response.headers.get('Content-Type')?.includes('application/json') ? await response.json() : {};
    if (!response.ok) throw Error(result.error || 'This approval action is unavailable.');
    if (result.url) location.assign(result.url);
    else output.textContent = result.message;
  } catch (error) {
    output.textContent = error.message;
  } finally {
    buttons.forEach(button => { button.disabled = false; });
  }
}

invite?.addEventListener('click', () => {
  const entry = document.querySelector('#entry-form');
  submitApproval('/entries/record/' + entry.dataset.id + '/telegram', { rev: Number(entry.dataset.rev) },
    document.querySelector('#telegram-approval-status'), [invite]);
});

if (reviewForm) {
  const buttons = [...reviewForm.querySelectorAll('button')];
  const output = reviewForm.querySelector('output');
  reviewForm.querySelector('[data-send-code]').addEventListener('click', () => {
    submitApproval(location.pathname + '/code', {}, output, buttons);
  });
  reviewForm.addEventListener('submit', event => {
    event.preventDefault();
    submitApproval(location.pathname, Object.fromEntries(new FormData(reviewForm)), output, buttons);
  });
}
