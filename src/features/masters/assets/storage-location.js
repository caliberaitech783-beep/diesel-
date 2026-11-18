const storageType = document.querySelector('[data-field-key="storage-type"]');
const calibrationChart = document.querySelector('[data-field-key="calibration-chart"]');
const requiredMark = calibrationChart.labels[0].querySelector('.required-mark');

function updateChartRequirement() {
  const type = storageType.value.trim().toLowerCase().replace(/[\s./_-]+/g, '');
  const required = /^(ug|underground)(storage)?tanks?$/.test(type);
  calibrationChart.required = required;
  requiredMark.hidden = !required;
  if (calibrationChart.validity.valid) calibrationChart.removeAttribute('aria-invalid');
}

storageType.addEventListener('input', updateChartRequirement);
storageType.addEventListener('change', updateChartRequirement);
window.addEventListener('pageshow', () => requestAnimationFrame(updateChartRequirement));
updateChartRequirement();
