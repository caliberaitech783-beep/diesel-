import assert from 'node:assert/strict';
import test from 'node:test';
import { masters } from './catalog.mjs';
import { mastersPage } from './page.mjs';

test('the landing page lists all masters in the sidebar and waits for a selection', () => {
  const html = mastersPage({ account: 'Guest', guest: true });
  assert.match(html, /<aside class="sidebar" id="masters-sidebar">/);
  assert.doesNotMatch(html, /sidebar-toggle|aria-current="page"|<form\b/);
  assert.match(html, /<h1 id="workspace-title">Choose a master<\/h1>/);
  const group = html.match(/<details\b[^>]*\bopen[^>]*>([\s\S]*?)<\/details>/);
  assert.ok(group, 'the Master group is open on first load');
  const [, summary, list] = group[1].match(/<summary>([\s\S]*?)<\/summary>\s*<ul\b[^>]*>([\s\S]*?)<\/ul>/);
  assert.equal(summary.replace(/<[^>]*>/g, ''), 'Master');
  const links = Array.from(list.matchAll(/<a href="([^"]+)">([^<]+)<\/a>/g), ([, href, name]) => [href, name]);
  assert.deepEqual(links, masters.map(({ slug, name }) => [`/?master=${slug}`, name]));
});

test('all 20 masters open exactly one form with a link back to the catalog', () => {
  assert.equal(new Set(masters.map(master => master.slug)).size, 20);
  for (const { name, slug } of masters) {
    const html = mastersPage({ master: slug, account: 'Guest', guest: true });
    assert.doesNotMatch(html, /id="masters-sidebar"|sidebar-toggle/);
    assert.match(html, /href="\/" aria-label="Back to masters"[^>]*>\s*<svg\b/);
    assert.ok(html.includes(`<h1 id="workspace-title">${name}</h1>`));
    assert.equal((html.match(/<form class="master-form"/g) || []).length, 1);
    assert.doesNotMatch(html, /type="file"|type="submit"|formaction=/);
  }
});

test('an unknown master returns to the selection page', () => {
  const html = mastersPage({ master: 'unknown', account: 'Guest', guest: true });
  assert.match(html, /<h1 id="workspace-title">Choose a master<\/h1>/);
  assert.doesNotMatch(html, /aria-current="page"|<form\b/);
});

test('the final template additions keep their labels and required markers', () => {
  const additions = slug => masters.find(master => master.slug === slug).sections.at(-1).fields
    .map(({ label, required }) => [label, required]);
  assert.deepEqual(additions('item-master'), [
    ['Density minimum (kg/m³)', true],
    ['Density maximum (kg/m³)', true],
    ['Volume basis', true],
    ['Reference temperature (°C)', false],
    ['iBoss item code', false],
  ]);
  assert.deepEqual(additions('account-master'), [
    ['Recovery rate basis (hire parties, contractors)', false],
    ['Bank details verified by', true],
    ['Status', true],
    ['iBoss A/C Code', false],
  ]);
});

// Total and mandatory fields in the current forms, in sidebar order.
const templateCounts = [
  ['item-master', 23, 16],
  ['account-master', 60, 28],
  ['cmll-master', 49, 14],
  ['cost-centre-vehicle-master', 19, 14],
  ['storage-location-master', 21, 12],
  ['route-wise-diesel-master', 16, 12],
  ['driver-master', 71, 14],
  ['tax-master-tds', 16, 12],
  ['location-master', 18, 7],
  ['gst-master', 10, 9],
  ['supplier-depot-master', 5, 4],
  ['diesel-rate-master', 13, 10],
  ['transport-freight-master', 8, 7],
  ['measuring-instrument-master', 7, 7],
  ['volume-correction-table', 3, 3],
  ['approval-limit-master', 9, 6],
  ['tolerance-and-alert-master', 6, 6],
  ['reason-code-master', 5, 5],
  ['shift-master', 5, 5],
  ['document-numbering-master', 5, 5],
];

test('every sidebar master has a preview template', () => {
  assert.deepEqual(masters.map(master => master.slug), templateCounts.map(([slug]) => slug));
});

for (const [slug, fieldCount, requiredCount] of templateCounts) {
  test(`${slug} preview exposes the template fields and their required state`, () => {
    const { name, sections: definition } = masters.find(master => master.slug === slug);
    const html = mastersPage({ master: slug, account: 'Guest', guest: true });
    assert.ok(html.includes(`<h1 id="workspace-title">${name}</h1>`));
    const form = html.match(/<form\b[^>]*>([\s\S]*?)<\/form>/)?.[1];
    assert.ok(form, 'the selected master has a form');
    assert.doesNotMatch(form, /<details\b/, 'all sections stay visible');
    const headings = Array.from(form.matchAll(/<h2 class="field-group-heading">([^<]+)<\/h2>/g), ([, heading]) => heading);
    assert.deepEqual(headings, definition.map(section => section.name));
    const fields = definition.flatMap(section => section.fields);
    assert.equal(fields.length, fieldCount);
    assert.equal(fields.filter(field => field.required).length, requiredCount);

    const controls = [...form.matchAll(/<(?:input|select|textarea)\b[^>]*>/g)].map(match => match[0]);
    const labels = [...form.matchAll(/<label\b[^>]*\bfor="([^"]+)"[^>]*>([\s\S]*?)<\/label>/g)];
    assert.equal(controls.length, fieldCount);
    assert.equal(labels.length, fieldCount);
    assert.equal(new Set(labels.map(([, id]) => id)).size, fieldCount, 'each field has a unique label target');
    for (const [index, [, id, content]] of labels.entries()) {
      const field = fields[index];
      const control = controls.find(element => element.includes(` id="${id}"`));
      assert.ok(control, `a field exists for label ${id}`);
      const label = content.replace(/<[^>]+>/g, '').trim();
      assert.equal(label.replace(/\s*\*$/, ''), field.label);
      assert.equal(label.endsWith('*'), field.required, `template marker for ${field.label}`);
      assert.equal(/\sreadonly(?=[\s=>])/.test(control), Boolean(field.readOnly), field.label);
      assert.equal(/\srequired(?=[\s=>])/.test(control), field.required && !field.readOnly && field.type !== 'file', field.label);
      if (field.type === 'number') {
        assert.match(control, /\btype="number"/);
        assert.ok(control.includes(` step="${field.step ?? 'any'}"`), `numeric step for ${field.label}`);
      }
    }
  });
}

test('the worked-out Diesel rate is read-only and the next document number is an integer', () => {
  const fieldsFor = slug => masters.find(master => master.slug === slug).sections.flatMap(section => section.fields);
  const rate = fieldsFor('diesel-rate-master').find(field => field.label === 'Diesel rate (₹/KL), worked out');
  assert.equal(rate.required, true);
  assert.equal(rate.readOnly, true);
  const nextNumber = fieldsFor('document-numbering-master').find(field => field.label === 'Next number');
  assert.equal(nextNumber.type, 'number');
  assert.equal(nextNumber.step, 1);
});
