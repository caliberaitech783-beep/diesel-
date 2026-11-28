// A single action moves on; a double action opens the current field's choices.
// Wait for the second action before moving focus, so it still belongs to this field.
{
  const form = document.querySelector('#entry-form');
  if (form) {
    const purchaseOrder = form.dataset.type === 'E2';
    let pending, mouse;
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
    const next = field => {
      const fields = [...form.querySelectorAll(purchaseOrder ? 'input, select, textarea, button[data-terms], button[type=submit][value=Submit]' : 'input, select, textarea')].filter(usable), at = fields.indexOf(field);
      return at < 0 ? null : fields[at + 1];
    };
    const move = field => { if (document.activeElement === field && usable(field)) next(field)?.focus(); };
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

    form.addEventListener('keydown', event => {
      if (event.defaultPrevented) { cancel(); return; }
      const field = event.target;
      if (field.matches('button[type=submit]')) { cancel(); return; }
      if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || event.isComposing
        || !usable(field) || field.matches('textarea')) { cancel(); return; }
      if (!next(field) && !picker(field)) return;
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
      if (picker(field)) {
        // Suppress a native dropdown's first mouse press so a double-click can reach it.
        event.preventDefault();
        field.focus({ preventScroll: true });
      }
    });
    form.addEventListener('click', event => {
      const pressed = mouse;
      mouse = null;
      if (event.detail !== 1 || pressed?.field !== event.target || !pressed.focused) return;
      const field = event.target;
      if (field.matches('select, input[list]') && !picker(field)) return;
      if (usable(field) && String(field.value).trim() && field.validity.valid && !field.matches('input[type=date], input[type=time], input[type=datetime-local], input[type=month], input[type=week], input[type=color]')) wait(field, 'mouse');
    });
    form.addEventListener('dblclick', event => {
      cancel();
      if (usable(event.target) && open(event.target)) event.preventDefault();
    });
    form.addEventListener('input', cancel);
    form.addEventListener('focusout', cancel);
  }
}
