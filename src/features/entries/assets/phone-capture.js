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
      if (input && !input.value) { input.value = value; input.dispatchEvent(new Event('change', { bubbles: true })); filled++; }
    }
    status.textContent = filled ? 'Check the suggested values against the invoice before saving.' : 'No blank fields could be filled. Check the invoice and enter the remaining details.';
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

// Live camera scan: reads a QR or barcode tag from the rear camera and selects the matching record.
const scanButton = document.querySelector('#scan-camera');
const scanVideo = document.querySelector('#scan-video');
if (scanButton && navigator.mediaDevices?.getUserMedia) {
  scanButton.hidden = false;
  let stream = null, timer = 0;
  const canvas = document.createElement('canvas');
  const detector = 'BarcodeDetector' in window
    ? new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'data_matrix'] }) : null;
  function stopScan(message) {
    clearInterval(timer);
    stream?.getTracks().forEach(track => track.stop());
    stream = null;
    scanVideo.hidden = true;
    scanButton.textContent = 'Scan with camera';
    if (message) captureStatus.textContent = message;
  }
  async function readFrame() {
    if (scanVideo.readyState < 2) return null;
    if (detector) return (await detector.detect(scanVideo))[0]?.rawValue ?? null;
    if (!window.jsQR) return null;
    canvas.width = scanVideo.videoWidth;
    canvas.height = scanVideo.videoHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(scanVideo, 0, 0);
    return window.jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height)?.data ?? null;
  }
  scanButton.addEventListener('click', async () => {
    if (stream) return stopScan('Camera scan stopped.');
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      scanVideo.srcObject = stream;
      scanVideo.hidden = false;
      await scanVideo.play();
      scanButton.textContent = 'Stop camera';
      captureStatus.textContent = 'Point the camera at the tag.';
      const started = Date.now();
      timer = setInterval(async () => {
        try {
          const value = await readFrame();
          if (value) {
            stopScan();
            document.querySelector('#tag-input').value = value;
            document.querySelector('#use-tag').click();
          } else if (Date.now() - started > 60000) stopScan('No tag found. Try again closer to the tag.');
        } catch { stopScan('Could not read the camera. Use a QR photo instead.'); }
      }, 300);
    } catch {
      stopScan('Camera unavailable. Allow camera access or take a QR photo instead.');
    }
  });
}
