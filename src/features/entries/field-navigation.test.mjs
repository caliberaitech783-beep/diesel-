import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('./assets/field-navigation.js', import.meta.url), 'utf8');

function setup(specs, type = '') {
  const events = {}, documentEvents = {}, timers = new Map();
  let now = 0, sequence = 0;
  const form = { dataset: { type }, querySelectorAll: () => fields, addEventListener: (name, handler, capture = false) => { (events[name] ??= []).push({ handler, capture }); } };
  const document = { activeElement: null, querySelector: () => form,
    addEventListener: (name, handler) => { (documentEvents[name] ??= []).push(handler); },
    createElement: () => ({ setAttribute() {}, remove() { this.removed = true; } }) };
  const fields = specs.map(spec => {
    const attributes = Object.fromEntries(Object.entries({ 'data-field-picker': spec.fieldPicker, 'data-required': spec.requiredData,
      'data-loading-gross': spec.gross, 'data-terms': spec.terms, 'data-dispatch-po-number': spec.lookup, 'data-indent-toggle': spec.indentToggle })
      .filter(([, value]) => value).map(([name]) => [name, 'true']));
    const field = { tagName: 'INPUT', type: 'text', size: spec.tagName === 'SELECT' ? 0 : 20, value: 'Filled', offsetParent: {}, form, validity: { valid: true }, ...spec,
      focus() {
        if (document.activeElement === field) return;
        if (document.activeElement) fire('focusout', document.activeElement);
        document.activeElement = field; fire('focusin', field);
      },
      matches(selector) {
        return selector.split(',').some(part => {
          const tag = /^(input|select|textarea|button)/.exec(part.trim())?.[1];
          if (tag && field.tagName !== tag.toUpperCase()) return false;
          for (const [, name] of part.matchAll(/\[(data-[\w-]+)\]/g)) if (!Object.hasOwn(attributes, name)) return false;
          if (part.includes('[value=Submit]') && field.value !== 'Submit') return false;
          if (part.includes('[list]') && !field.list) return false;
          if (part.includes(':not([multiple])') && field.multiple) return false;
          const type = /(?<!:not\()\[type=([\w-]+)\]/.exec(part);
          if (type && field.type !== type[1]) return false;
          if ([...part.matchAll(/:not\(\[type=([\w-]+)\]\)/g)].some(([, excluded]) => excluded === field.type)) return false;
          return true;
        });
      },
      hasAttribute: name => Object.hasOwn(attributes, name),
      getAttribute: name => attributes[name] ?? null,
      setAttribute: (name, value) => { attributes[name] = value; },
      removeAttribute: name => { delete attributes[name]; },
      after: message => { field.error = message; },
      scrollIntoView() {},
      dispatchEvent(event) { if (event.type === 'field-picker-open') field.opened = (field.opened ?? 0) + 1; },
      closest(selector) {
        if (selector === '.dispatch-po-field') return field.lookup ? { querySelector: () => field.button } : null;
        if (selector === '.po-indent-picker') return field.indentToggle ? { querySelector: () => fields.find(item => item.fieldPicker) } : null;
        return field.matches(selector) ? field : null;
      },
    };
    if (spec.showPicker !== false && (field.tagName === 'SELECT' || field.list)) field.showPicker = () => { field.opened = (field.opened ?? 0) + 1; };
    return field;
  });
  runInNewContext(source, { document, Event, setTimeout(fn, delay) { const id = ++sequence; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout: id => timers.delete(id) });
  function fire(name, field, props = {}) {
    const event = { target: field, key: 'Enter', button: 0, pointerType: 'mouse', detail: 1, ...props,
      preventDefault() { this.defaultPrevented = true; }, stopImmediatePropagation() { this.stopped = true; } };
    if (name === 'pointerdown') for (const handler of documentEvents.pointerdown ?? []) handler(event);
    for (const capture of [true, false]) for (const listener of events[name] ?? []) {
      if (!event.stopped && listener.capture === capture) listener.handler(event);
    }
    if (name === 'pointerdown' && !event.defaultPrevented) field.focus();
    return event;
  }
  const click = (field, detail = 1, pointerType = 'mouse') => {
    const down = fire('pointerdown', field, { detail, pointerType });
    fire('click', field, { detail, pointerType });
    if (detail === 2) fire('dblclick', field, { detail, pointerType });
    return down;
  };
  const tick = ms => {
    now += ms;
    for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.fn(); }
  };
  return { fields, document, fire, click, tick };
}

test('one Enter moves to the next editable field after the double-action interval', () => {
  const view = setup([{}, { disabled: true }, { readOnly: true }, { offsetParent: null }, { list: true, name: '' }]);
  const [first, , , , next] = view.fields;
  first.focus();
  assert.equal(view.fire('keydown', first).defaultPrevented, true);
  view.tick(400); assert.equal(view.document.activeElement, first);
  view.tick(100); assert.equal(view.document.activeElement, next);
});

test('double Enter opens selects and unnamed lookup suggestions without moving forward', () => {
  for (const field of [{ tagName: 'SELECT' }, { list: true, name: '' }]) {
    const view = setup([field, {}]), [choice] = view.fields;
    choice.focus(); view.fire('keydown', choice); view.tick(150); view.fire('keydown', choice); view.tick(1000);
    assert.equal(choice.opened, 1);
    assert.equal(view.document.activeElement, choice);
  }
});

test('a native dropdown keeps normal single-click opening and never jumps away on click', () => {
  const view = setup([{ tagName: 'SELECT' }, {}]), [choice, next] = view.fields;
  choice.focus();
  assert.equal(view.click(choice).defaultPrevented, undefined, 'native mouse opening must not be suppressed');
  view.tick(500); assert.equal(view.document.activeElement, choice);
  choice.focus(); view.click(choice); view.tick(200); view.click(choice, 2); view.tick(1000);
  assert.equal(choice.opened, 1);
  assert.equal(view.document.activeElement, choice);
});

test('one click after completing a focused plain field moves forward', () => {
  const view = setup([{}, {}]), [field, next] = view.fields;
  field.focus(); view.click(field); view.tick(500);
  assert.equal(view.document.activeElement, next);
});

test('an empty dropdown opens on double-click, while an initial click keeps a field ready to edit', () => {
  const view = setup([{ value: '' }, { tagName: 'SELECT', value: '' }, {}]);
  view.click(view.fields[0]); view.tick(500);
  assert.equal(view.document.activeElement, view.fields[0]);
  view.click(view.fields[1]); view.click(view.fields[1], 2); view.tick(500);
  assert.equal(view.fields[1].opened, 1);
  assert.equal(view.document.activeElement, view.fields[1]);
});

test('double actions also open the Delivery Schedule purchase order list', () => {
  let opened = 0;
  const view = setup([{}, { readOnly: true, lookup: true, button: { click: () => { opened += 1; } } }, {}]);
  const [first, lookup] = view.fields;
  first.focus(); view.fire('keydown', first); view.tick(500);
  assert.equal(view.document.activeElement, lookup);
  view.fire('keydown', lookup); view.fire('keydown', lookup); view.tick(500);
  assert.equal(opened, 1);
  view.fire('dblclick', lookup); view.tick(500);
  assert.equal(opened, 2);
});

test('typing, moving focus or another pointer press cancels a pending advance', () => {
  for (const cancel of ['input', 'focus', 'pointerdown']) {
    const view = setup([{}, {}]), [first, next] = view.fields;
    first.focus(); view.fire('keydown', first);
    if (cancel === 'focus') next.focus(); else view.fire(cancel, first);
    view.tick(500);
    assert.equal(view.document.activeElement, cancel === 'focus' ? next : first);
  }
});

test('holding Enter cannot count as a double press or submit the form', () => {
  const view = setup([{ tagName: 'SELECT' }, {}]), [choice, next] = view.fields;
  choice.focus(); view.fire('keydown', choice);
  assert.equal(view.fire('keydown', choice, { repeat: true }).defaultPrevented, true);
  view.tick(500);
  assert.equal(choice.opened, undefined);
  assert.equal(view.document.activeElement, next);
});

test('textareas, modifiers, touch, read-only values and file/button controls keep their behavior', () => {
  for (const spec of [{ tagName: 'TEXTAREA' }, { readOnly: true }, { type: 'file' }, { type: 'submit' }, { type: 'checkbox' }]) {
    const view = setup([spec, {}]), [field] = view.fields;
    field.focus(); assert.equal(view.fire('keydown', field).defaultPrevented, undefined);
    view.tick(500); assert.equal(view.document.activeElement, field);
  }
  for (const modifier of ['shiftKey', 'ctrlKey', 'altKey', 'metaKey', 'isComposing']) {
    const view = setup([{}, {}]), [field] = view.fields;
    field.focus(); assert.equal(view.fire('keydown', field, { [modifier]: true }).defaultPrevented, undefined);
  }
  const view = setup([{ tagName: 'SELECT' }, {}]), [choice] = view.fields;
  choice.focus(); assert.equal(view.click(choice, 1, 'touch').defaultPrevented, undefined);
  view.tick(500); assert.equal(view.document.activeElement, choice);
});

test('browsers without showPicker retain native dropdown mouse behavior', () => {
  const view = setup([{ tagName: 'SELECT', showPicker: false }, {}]), [choice] = view.fields;
  choice.focus();
  assert.equal(view.click(choice).defaultPrevented, undefined);
  view.tick(500); assert.equal(view.document.activeElement, choice);
});

test('list boxes and Enter already handled by another field action are left alone', () => {
  const view = setup([{ tagName: 'SELECT', size: 4 }, {}]), [list] = view.fields;
  list.focus(); assert.equal(view.click(list).defaultPrevented, undefined);
  view.tick(500); assert.equal(view.document.activeElement, list);
  view.fire('keydown', list, { defaultPrevented: true }); view.tick(500);
  assert.equal(view.document.activeElement, list);
  view.fire('keydown', list); view.fire('keydown', list, { key: 'ArrowDown', defaultPrevented: true }); view.tick(500);
  assert.equal(view.document.activeElement, list, 'opening choices cancels any queued forward movement');
});

test('a double action on a plain field never opens a picker or skips two fields', () => {
  const view = setup([{}, {}, {}]), [first, next] = view.fields;
  first.focus(); view.fire('keydown', first); view.fire('keydown', first); view.tick(1000);
  assert.equal(view.document.activeElement, next);
  assert.equal(next.opened, undefined);
});

test('PO navigation includes its checkboxes and payment choice, and ends by focusing Save without submitting', () => {
  const view = setup([{}, { type: 'checkbox', gross: true }, { tagName: 'BUTTON', type: 'button', terms: true }, {},
    { tagName: 'BUTTON', type: 'submit', value: 'Submit' }], 'E2');
  view.fields[0].focus();
  for (let i = 0; i < view.fields.length - 1; i += 1) {
    view.fire('keydown', view.fields[i]); view.tick(500);
    assert.equal(view.document.activeElement, view.fields[i + 1]);
  }
  assert.equal(view.fire('keydown', view.fields.at(-1)).defaultPrevented, undefined, 'Save itself remains an explicit action');
});

test('the custom PO indent dropdown opens on double Enter and double-click', () => {
  const view = setup([{ fieldPicker: true }, {}], 'E2'), [indent] = view.fields;
  indent.focus(); view.fire('keydown', indent); view.fire('keydown', indent); view.tick(500);
  assert.equal(indent.opened, 1); assert.equal(view.document.activeElement, indent);
  view.fire('dblclick', indent); view.tick(500);
  assert.equal(indent.opened, 2); assert.equal(view.document.activeElement, indent);
});

test('empty required fields and invalid values cannot be skipped with Enter or Tab', () => {
  for (const spec of [{ value: '', requiredData: true }, { value: '', required: true }, { validity: { valid: false }, validationMessage: 'Enter a valid quantity.' }]) {
    for (const key of ['Enter', 'Tab']) {
      const view = setup([spec, {}]), [field] = view.fields;
      field.focus(); assert.equal(view.fire('keydown', field, { key }).defaultPrevented, true);
      view.tick(500); assert.equal(view.document.activeElement, field);
      assert.equal(field.getAttribute('aria-invalid'), 'true');
      assert.ok(field.error.textContent);
    }
  }
});

test('mouse, touch, direct focus and paste cannot fill a later field before its required predecessor', () => {
  for (const action of ['mouse', 'touch', 'focus', 'beforeinput']) {
    const view = setup([{ requiredData: true, value: '' }, {}, {}]), [first, , later] = view.fields;
    if (action === 'focus') later.focus();
    else if (action === 'beforeinput') assert.equal(view.fire('beforeinput', later).defaultPrevented, true);
    else assert.equal(view.click(later, 1, action === 'touch' ? 'touch' : 'mouse').defaultPrevented, true);
    assert.equal(view.document.activeElement, first, action);
    assert.equal(later.value, 'Filled', 'the later value remains untouched');
  }
});

test('completing the required field clears the message and unlocks the next field', () => {
  const view = setup([{ requiredData: true, value: '' }, {}]), [first, next] = view.fields;
  view.click(next); assert.equal(view.document.activeElement, first);
  first.value = 'Valid'; view.fire('input', first);
  assert.equal(first.getAttribute('aria-invalid'), null);
  assert.equal(first.error.removed, true);
  view.click(next); assert.equal(view.document.activeElement, next);
});

test('optional empty fields remain skippable and completed earlier fields remain editable', () => {
  const view = setup([{ value: '' }, { value: '', requiredData: true }, {}]), [optional, required] = view.fields;
  optional.focus(); view.fire('keydown', optional); view.tick(500);
  assert.equal(view.document.activeElement, required);
  view.click(optional); assert.equal(view.document.activeElement, optional);
});

test('an empty current dropdown is selectable with one click or double Enter', () => {
  const view = setup([{ tagName: 'SELECT', value: '', requiredData: true }, {}]), [choice] = view.fields;
  assert.equal(view.click(choice).defaultPrevented, undefined);
  view.fire('keydown', choice); view.fire('keydown', choice); view.tick(500);
  assert.equal(choice.opened, 1); assert.equal(view.document.activeElement, choice);
});

test('custom dropdown fields open on one click without advancing', () => {
  const view = setup([{ fieldPicker: true, value: '', requiredData: true }, {}], 'E2'), [choice] = view.fields;
  view.click(choice); view.tick(500);
  assert.equal(choice.opened, 1); assert.equal(view.document.activeElement, choice);
});
