import assert from 'node:assert/strict';
import test from 'node:test';
import { masters } from './catalog.mjs';
import { mastersPage } from './page.mjs';

test('Master is an expanded sidebar group containing every subtab in catalog order', () => {
  const html = mastersPage({ account: 'Guest', guest: true });
  const group = html.match(/<details\b[^>]*\bopen[^>]*>([\s\S]*?)<\/details>/);
  assert.ok(group, 'the Master group is open on first load');
  const [, summary, list] = group[1].match(/<summary>([\s\S]*?)<\/summary>\s*<ul\b[^>]*>([\s\S]*?)<\/ul>/);
  assert.equal(summary.replace(/<[^>]*>/g, ''), 'Master');
  const labels = Array.from(list.matchAll(/<li><a\b[^>]*>([^<]+)<\/a><\/li>/g), match => match[1]);
  assert.deepEqual(labels, masters.map(master => master.name));
});

test('all 20 masters have distinct links and open their public previews', () => {
  assert.equal(new Set(masters.map(master => master.slug)).size, 20);
  for (const { name, slug } of masters) {
    const html = mastersPage({ master: slug, account: 'Guest', guest: true });
    assert.equal((html.match(/href="\?master=/g) || []).length, 20);
    assert.equal((html.match(/aria-current="page"/g) || []).length, 1);
    assert.ok(html.includes(`href="?master=${slug}" aria-current="page">${name}</a>`));
    assert.ok(html.includes(`<h1 id="workspace-title">${name}</h1>`));
    assert.match(html, /<form class="master-form"/);
    assert.doesNotMatch(html, /type="file"|type="submit"|formaction=/);
  }
});

test('an unknown master opens the first tab', () => {
  const html = mastersPage({ master: 'unknown', account: 'Guest', guest: true });
  assert.ok(html.includes('<h1 id="workspace-title">Item Master</h1>'));
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

// Total and mandatory fields from page 4 of the final templates, in sidebar order.
const templateCounts = [
  ['item-master', 23, 16],
  ['account-master', 60, 28],
  ['cmll-master', 49, 14],
  ['cost-centre-vehicle-master', 18, 14],
  ['storage-location-master', 21, 12],
  ['route-wise-diesel-master', 16, 12],
  ['driver-master', 71, 14],
  ['tax-master-tds', 16, 12],
  ['location-master', 18, 7],
  ['gst-master', 10, 9],
  ['supplier-depot-master', 5, 4],
  ['diesel-rate-master', 15, 12],
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
    assert.ok(html.includes(`href="?master=${slug}" aria-current="page">${name}</a>`));
    assert.ok(html.includes(`<h1 id="workspace-title">${name}</h1>`));
    const form = html.match(/<form\b[^>]*>([\s\S]*?)<\/form>/)?.[1];
    assert.ok(form, 'the selected master has a form');
    const sections = form.match(/<details\b[^>]*>/g) ?? [];
    assert.equal(sections.length, definition.length, 'each template section is rendered');
    for (const section of sections) {
      assert.match(section, /\sopen(?=[\s=>])/, 'each section starts expanded');
    }
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
