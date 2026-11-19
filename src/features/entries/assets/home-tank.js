// UG tank to bowser: a scanned or chosen bowser suggests its home tank. The operator can still choose another tank.
const transferForm = document.querySelector('#entry-form[data-type="E10A"]');
if (transferForm?.elements.bowser && transferForm.elements.tank) {
  const { bowser, tank } = transferForm.elements;
  let chosenByOperator = Boolean(tank.value) && tank.options.length > 2;
  tank.addEventListener('change', event => { if (event.isTrusted) chosenByOperator = true; });
  function suggestHomeTank() {
    const home = bowser.selectedOptions[0]?.dataset.homeTank;
    if (!home || chosenByOperator || ![...tank.options].some(option => option.value === home)) return;
    tank.value = home;
    tank.dispatchEvent(new Event('change', { bubbles: true }));
  }
  bowser.addEventListener('change', suggestHomeTank);
  suggestHomeTank();
}
