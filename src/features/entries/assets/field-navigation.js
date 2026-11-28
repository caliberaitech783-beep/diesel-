// Dropdowns keep their normal single-click opening. Moving forward requires a complete field.
// A quick second Enter can still open choices before focus moves to the next field.
{
  const form = document.querySelector('#entry-form');
  if (form) {
    const purchaseOrder = form.dataset.type === 'E2';
    let pending, mouse, problem;
    const cancel = () => { clearTimeout(pending?.timer); pending = null; };
    const picker = field => {
      if (field.hasAttribute('data-field-picker')) return () => field.dispatchEvent(new Event('field-picker-open', { bubbles: true }));
      if (field.matches('[data-dispatch-po-number]')) {
        const button = field.closest('.dispatch-po-field')?.querySelector('[data-dispatch-po-open]');
        if (button && !button.disabled) return () => button.click();
      }
      if (!field.readOnly && field.matches('select:not([multiple]), input[list]') && (!field.matches('select') || field.size <= 1) && typeof field.showPicker === 'function') {
        return () => field.showPicker();
      }
      return null;
    };
    const usable = field => (field?.matches('input:not([type=hidden]):not([type=file]):not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]):not([type=reset]), select, textarea')
      || (purchaseOrder && field?.matches('[data-loading-gross], button[data-terms], button[type=submit][value=Submit]')))
      && field.form === form && !field.disabled && field.offsetParent !== null && (!field.readOnly || picker(field));
    const fields = () => [...form.querySelectorAll(purchaseOrder ? 'input, select, textarea, button[data-terms], button[type=submit][value=Submit]' : 'input, select, textarea')].filter(usable);
    const incomplete = field => !field.matches('button') && (field.validity?.valid === false
      || ((field.required || field.hasAttribute('data-required')) && !String(field.value ?? '').trim()));
    const blocker = (field, includeSelf = false) => {
      const list = fields(), at = list.indexOf(field);
      return at < 0 ? null : list.slice(0, at + Number(includeSelf)).find(incomplete);
    };
    const clearProblem = () => {
      if (!problem) return;
      const { field, message, invalid, described } = problem;
      message.remove();
      for (const [name, value] of [['aria-invalid', invalid], ['aria-describedby', described]]) {
        if (value === null) field.removeAttribute(name); else field.setAttribute(name, value);
      }
      problem = null;
    };
    const stay = field => {
      cancel(); clearProblem();
      const message = document.createElement('small');
      message.id = 'entry-navigation-error'; message.className = 'field-error';
      // The field describes this message explicitly; it must not become part of a wrapping label's name.
      message.setAttribute('aria-hidden', 'true');
      message.textContent = field.validationMessage || 'Complete this field before moving to the next field.';
      problem = { field, message, invalid: field.getAttribute('aria-invalid'), described: field.getAttribute('aria-describedby') };
      (field.closest('.po-search-control') ?? field).after(message);
      field.setAttribute('aria-invalid', 'true');
      field.setAttribute('aria-describedby', [problem.described, message.id].filter(Boolean).join(' '));
      field.focus({ preventScroll: false });
      field.scrollIntoView({ block: 'center' });
    };
    const next = field => { const list = fields(), at = list.indexOf(field); return at < 0 ? null : list[at + 1]; };
    const move = field => {
      if (document.activeElement !== field || !usable(field)) return;
      const missing = blocker(field, true);
      if (missing) stay(missing); else { clearProblem(); next(field)?.focus(); }
    };
    const wait = (field, source) => {
      cancel();
      pending = { field, source, timer: setTimeout(() => { pending = null; move(field); }, 500) };
    };
    const open = field => {
      const show = picker(field);
      if (!show) return false;
      field.focus({ preventScroll: true });
      try { show(); } catch { /* Native keyboard controls remain available if a picker cannot open. */ }
      return true;
    };

    const targetField = target => {
      let field = target.closest?.('input, select, textarea, button') ?? target.closest?.('label')?.control;
      if (field?.matches('[data-indent-toggle]')) field = field.closest('.po-indent-picker')?.querySelector('[data-field-picker]');
      if (field?.matches('[data-dispatch-po-open]')) field = field.closest('.dispatch-po-field')?.querySelector('[data-dispatch-po-number]');
      return usable(field) ? field : null;
    };
    const guard = event => {
      const field = targetField(event.target), missing = field && blocker(field);
      if (missing) { event.preventDefault(); event.stopImmediatePropagation(); stay(missing); }
    };
    // Catch mouse, touch, Tab, paste and programmatic focus before a later field can be filled.
    form.addEventListener('pointerdown', guard, true);
    form.addEventListener('click', guard, true);
    form.addEventListener('beforeinput', guard, true);
    form.addEventListener('focusin', event => { const field = targetField(event.target), missing = field && blocker(field); if (missing) stay(missing); });

    form.addEventListener('keydown', event => {
      if (event.defaultPrevented) { cancel(); return; }
      const field = event.target;
      if (event.key === 'Tab') {
        cancel();
        const missing = !event.shiftKey && usable(field) && blocker(field, true);
        if (missing) { event.preventDefault(); stay(missing); }
        return;
      }
      const missing = usable(field) && blocker(field);
      if (event.key === 'Enter' && missing) { event.preventDefault(); stay(missing); return; }
      if (field.matches('button[type=submit]')) { cancel(); return; }
      if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || event.isComposing
        || !usable(field) || field.matches('textarea')) { cancel(); return; }
      if (!next(field) && !picker(field) && !incomplete(field)) return;
      event.preventDefault();
      if (event.repeat) return;
      if (pending?.field === field && pending.source === 'keyboard') {
        cancel();
        if (!open(field)) move(field);
      } else wait(field, 'keyboard');
    });
    document.addEventListener('pointerdown', () => { cancel(); mouse = null; }, true);
    form.addEventListener('pointerdown', event => {
      const field = event.target;
      if (event.pointerType !== 'mouse' || event.button !== 0 || !usable(field) || field.matches('button, input[type=checkbox]')) return;
      mouse = { field, focused: document.activeElement === field };
    });
    form.addEventListener('click', event => {
      const pressed = mouse;
      mouse = null;
      if (usable(event.target) && picker(event.target)) {
        cancel();
        if (!event.target.matches('select')) open(event.target);
        return;
      }
      if (event.detail !== 1 || pressed?.field !== event.target || !pressed.focused) return;
      const field = event.target;
      if (field.matches('select, input[list]') && !picker(field)) return;
      if (usable(field) && String(field.value).trim() && field.validity.valid && !field.matches('input[type=date], input[type=time], input[type=datetime-local], input[type=month], input[type=week], input[type=color]')) wait(field, 'mouse');
    });
    form.addEventListener('dblclick', event => {
      cancel();
      if (!usable(event.target)) return;
      const missing = blocker(event.target);
      if (missing) { event.preventDefault(); stay(missing); }
      else if (open(event.target)) event.preventDefault();
    });
    for (const type of ['input', 'change']) form.addEventListener(type, event => {
      cancel();
      if (problem?.field === event.target && !incomplete(event.target)) clearProblem();
    });
    form.addEventListener('focusout', cancel);
  }
}
