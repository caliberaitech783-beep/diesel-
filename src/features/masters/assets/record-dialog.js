const dialog = document.querySelector('.record-dialog');
if (dialog) {
  const frame = dialog.querySelector('iframe');
  const discard = dialog.querySelector('.record-discard');
  let opener, dirty = false, busy = false;
  const close = () => {
    dialog.close();
    frame.removeAttribute('src');
    document.documentElement.classList.remove('record-dialog-open');
    opener?.focus({ preventScroll: true });
  };
  const requestClose = () => {
    if (busy) return;
    if (!dirty) return close();
    discard.hidden = false;
    frame.inert = true;
    discard.querySelector('[data-keep-editing]').focus();
  };
  document.addEventListener('click', event => {
    const link = event.target.closest('a[data-record-dialog]');
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const url = new URL(link.href);
    if (url.origin !== location.origin) return;
    event.preventDefault();
    opener = link;
    dirty = busy = false;
    discard.hidden = true;
    frame.inert = false;
    dialog.querySelector('[role="status"]').hidden = false;
    dialog.querySelector('h2').textContent = 'Record details';
    url.searchParams.set('dialog', '1');
    frame.src = url.href;
    dialog.showModal();
    document.documentElement.classList.add('record-dialog-open');
  });
  dialog.querySelector('[data-close-record]').addEventListener('click', requestClose);
  dialog.addEventListener('cancel', event => { event.preventDefault(); requestClose(); });
  dialog.querySelector('[data-keep-editing]').addEventListener('click', () => {
    discard.hidden = true;
    frame.inert = false;
    frame.focus();
  });
  dialog.querySelector('[data-discard-record]').addEventListener('click', close);
  frame.addEventListener('load', () => { dialog.querySelector('[role="status"]').hidden = true; });
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow || !dialog.open) return;
    const message = event.data;
    if (message?.type === 'master-record-ready') dialog.querySelector('h2').textContent = message.title;
    if (message?.type === 'master-record-dirty') dirty = true;
    if (message?.type === 'master-record-busy') busy = Boolean(message.busy);
    if (message?.type === 'master-record-close') requestClose();
    if (message?.type === 'master-record-saved') {
      dirty = busy = false;
      close();
      document.querySelector('.record-dialog-feedback').textContent = message.message;
      window.dispatchEvent(new Event('master-record-changed'));
    }
  });
}

if (document.body.classList.contains('record-dialog-page') && window.parent !== window) {
  const send = data => window.parent.postMessage(data, location.origin);
  send({ type: 'master-record-ready', title: document.querySelector('#record-form')?.dataset.masterName ?? 'Record details' });
  document.querySelector('#record-form')?.addEventListener('input', () => send({ type: 'master-record-dirty' }));
  document.querySelector('[data-dialog-cancel]')?.addEventListener('click', () => send({ type: 'master-record-close' }));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !document.querySelector('dialog[open]')) {
      event.preventDefault();
      send({ type: 'master-record-close' });
    }
  });
}
