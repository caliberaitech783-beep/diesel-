const fuelForm = document.querySelector('#entry-form[data-type="E11"]');
if (fuelForm?.elements.vehicle) {
  const { vehicle, bowser, day, start, end } = fuelForm.elements;
  const vehicleInfo = fuelForm.querySelector('[data-vehicle-info]');
  const preview = fuelForm.querySelector('[data-fuel-preview]');
  const defaultDay = day.value;

  function updateVehicle() {
    const data = vehicle.selectedOptions[0]?.dataset;
    const details = [
      data?.vehicleType, data?.owner, data?.costCentre,
      data?.capacity ? 'Tank '+data.capacity+' L' : '',
      data?.lastReading ? 'Last reading '+data.lastReading : '',
    ].filter(Boolean);
    vehicleInfo.textContent = details.join(' · ');
    updateLitres();
  }

  function updateLitres() {
    const capacity = Number(vehicle.selectedOptions[0]?.dataset.capacity);
    const litres = Number(end.value) - Number(start.value);
    preview.textContent = start.value && end.value && litres > 0
      ? new Intl.NumberFormat('en-IN',{maximumFractionDigits:4}).format(litres)+' L'
        +(capacity > 0 && litres > capacity ? ' exceeds this vehicle’s '+capacity+' L tank.' : '')
      : '';
  }

  function updateBowserStart() {
    if (start.value && !start.dataset.prefilled) return;
    const previous = day.value === defaultDay ? bowser.selectedOptions[0]?.dataset.lastEnd : undefined;
    start.value = previous ?? '';
    if (previous !== undefined) start.dataset.prefilled = 'true';
    else delete start.dataset.prefilled;
    start.dispatchEvent(new Event('change', { bubbles: true }));
    updateLitres();
  }

  vehicle.addEventListener('change',updateVehicle);
  bowser.addEventListener('change',updateBowserStart);
  day.addEventListener('change',updateBowserStart);
  start.addEventListener('input',()=>{ delete start.dataset.prefilled;updateLitres(); });
  end.addEventListener('input',updateLitres);
  updateVehicle();
  updateBowserStart();
}
