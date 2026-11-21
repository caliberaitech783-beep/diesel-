// Field colours on entry forms: lavender = filled by the system, amber = a system value you changed,
// green = filled, red = a required field still empty (shown once touched or after Submit).
{
  const entryForm = document.querySelector('#entry-form');
  if (entryForm) {
    const fresh = entryForm.dataset.rev === '0';
    const controls = [...entryForm.querySelectorAll('.fields :is(input:not([type=file]):not([type=hidden]), select)')];
    const system = new WeakSet(), touched = new WeakSet();
    const empty = control => !String(control.value ?? '').trim();
    function paint(control) {
      const label = control.closest('label');
      if (!label) return;
      let state = '';
      if (!control.validity.valid || (control.dataset.required && empty(control) && touched.has(control))) state = 'missing';
      else if (empty(control)) state = '';
      else if (system.has(control)) state = control.dataset.systemValue === control.value ? 'prefilled' : 'changed';
      else state = 'ok';
      if (state) label.dataset.state = state; else delete label.dataset.state;
    }
    function systemFill(control) {
      if (empty(control)) return;
      system.add(control);
      control.dataset.systemValue = control.value;
      paint(control);
    }
    for (const control of controls) {
      if (fresh && !empty(control)) systemFill(control);
      if (control.dataset.prefilled) systemFill(control);
      control.addEventListener('blur', () => { touched.add(control); paint(control); });
      for (const type of ['input', 'change']) control.addEventListener(type, event => {
        if (!event.isTrusted) systemFill(control); else paint(control);
      });
      new MutationObserver(() => control.dataset.prefilled ? systemFill(control) : paint(control))
        .observe(control, { attributes: true, attributeFilter: ['data-prefilled'] });
      paint(control);
    }
    entryForm.addEventListener('click', event => {
      if (event.target.closest('button')?.value !== 'Submit') return;
      for (const control of controls) { touched.add(control); paint(control); }
    });
  }
}
