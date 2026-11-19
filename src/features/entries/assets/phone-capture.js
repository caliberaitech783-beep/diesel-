const entryForm = document.querySelector('#entry-form');
const captureStatus = document.querySelector('#sync-status');
const stepNav = document.querySelector('#phone-step-navigation');
if (stepNav) {
  const steps = [...entryForm.querySelectorAll('[data-step]')];
  const phone = window.matchMedia('(max-width: 600px)');
  const back = stepNav.querySelector('[data-step-back]');
  const next = stepNav.querySelector('[data-step-next]');
  const count = stepNav.querySelector('[data-step-count]');
  const submit = entryForm.querySelector('button[value="Submit"]');
  let current = 0;
  function renderStep() {
    stepNav.hidden = !phone.matches;
    steps.forEach((step, index) => { step.hidden = phone.matches && index !== current; });
    back.disabled = current === 0;
    next.hidden = current === steps.length - 1;
    if (submit) submit.hidden = phone.matches && current !== steps.length - 1;
    count.textContent = (current + 1) + ' of ' + steps.length;
  }
  function move(delta) {
    current += delta;
    renderStep();
    steps[current].querySelector('input, select')?.focus();
  }
  back.addEventListener('click', () => move(-1));
  next.addEventListener('click', () => move(1));
  phone.addEventListener('change', renderStep);
  renderStep();
}

document.querySelector('#tag-photo')?.addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const { canvas, ctx } = await imageCanvas(file, 1200);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = window.jsQR(pixels.data, pixels.width, pixels.height);
    if (!code) throw new Error('No QR code found. Move closer and try again.');
    document.querySelector('#tag-input').value = code.data;
    document.querySelector('#use-tag').click();
  } catch (error) {
    captureStatus.textContent = error.message;
  } finally {
    event.target.value = '';
  }
});

document.querySelector('#read-invoice')?.addEventListener('click', async event => {
  const button = event.currentTarget;
  const status = document.querySelector('#entry-message');
  button.disabled = true;
  status.textContent = 'Reading invoice photo…';
  try {
    const { canvas } = await imageCanvas(entryForm.elements.billPhoto.files[0], 1600);
    const image = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!image || image.size > 5 * 1024 * 1024) throw new Error('Crop the photo closely around the invoice.');
    const response = await fetch('/entries/invoice-photo', { method: 'POST', headers: {'Content-Type':'image/png'}, body: image });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    let filled = 0;
    for (const [key,value] of Object.entries(result.fields)) {
      if (!['invoice','invoiceDate','eway','litres','truck'].includes(key)) continue;
      const input = entryForm.elements[key];
      if (input && !input.value) { input.value = value; filled++; }
    }
    status.textContent = filled ? 'Check the suggested values against the invoice before saving.' : 'No blank fields could be filled. Check the invoice and enter the remaining details.';
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
