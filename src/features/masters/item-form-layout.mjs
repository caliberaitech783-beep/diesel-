// Presentation groups can evolve without changing saved field keys or CSV columns.
export function formSections(master) {
  const sections = master.sections.map(section => ({
    name: section.name,
    fields: master.fields.filter(field => field.section === section.name),
  }));
  if (master.slug !== 'item-master') return sections;
  const names = ['Basic details', 'Stock and accounts', 'Specification and tax', 'Diesel settings'];
  return [
    ...sections.map((section, index) => ({
      ...section, name: names[index], fields: section.fields.filter(field => field.type !== 'file'),
    })),
    { name: 'Attachments', fields: master.fields.filter(field => field.type === 'file') },
  ];
}

export function displayValue(value) {
  return value && typeof value === 'object' ? String(value.name ?? '') : String(value ?? '');
}

