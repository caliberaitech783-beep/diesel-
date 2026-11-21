import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { attributeFields } from './attribute-page.mjs';
import { masterForm } from './master-form.mjs';

const css = await readFile(new URL('./assets/master-form.css', import.meta.url), 'utf8');

test('master forms fill each section and line boxes up across a row', () => {
  assert.match(css, /\.field-grid \{[^}]*grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 15rem\), 1fr\)\)/);
  assert.match(css, /\.master-field \{[^}]*grid-row: span 3;[^}]*grid-template-rows: subgrid;/);
  assert.doesNotMatch(css, /--heading-width|--form-cols|flex: 1 0 auto/, 'section titles and empty fixed columns do not reserve unused space');
  const form = masterForm({ slug: 'sample', sections: [{ name: 'Details', fields: [{ label: 'Long required label', required: true }] }] });
  assert.match(form, /Long required label <span class="required-mark"/, 'the required star stays on the label’s last line');
});

test('dated attribute rows keep their own layout inside the section body', () => {
  const html = attributeFields(null, true, '/api');
  assert.match(html, /<section data-attributes[^>]*class="field-group">\s*<h2 class="field-group-heading">[^<]+<\/h2>\s*<div class="attribute-body">/);
  assert.match(html, /<fieldset data-attribute-row data-id="" class="attribute-row">/);
  assert.doesNotMatch(html, /<fieldset[^>]*class="field-group"/);
});
