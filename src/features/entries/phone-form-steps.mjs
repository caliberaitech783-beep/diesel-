const layouts = {
  E5: [['Invoice', ['billPhoto','po','invoice','invoiceDate','litres','eway']],
    ['Truck and driver', ['truck','driver','mobile','fitness','licence','transporter','scenario']],
    ['Seals and evidence', ['seals','intact','sealPhotos']]],
  E6: [['Quality check', ['gate','density','temperature','instrument']],
    ['Storage readings', ['tank','before','after']],
    ['Decision and photos', ['decision','reason','evidence']]],
  E10A: [['Scan storage', ['tank','bowser']], ['Read the meters', ['before','after','start','end']],
    ['Evidence', ['evidence','reason']]],
  E11: [['Scan vehicle and bowser', ['vehicle','bowser','driver']],
    ['Read the meters', ['reading','start','end']], ['Evidence', ['evidence','reason']]],
};

export function formSteps(meta) {
  const layout = layouts[meta.id];
  if (!layout) return null;
  const byKey = new Map(meta.fields.map(field => [field.key,field]));
  const placed = new Set(layout.flatMap(([,keys])=>keys));
  return layout.map(([title,keys], index) => ({
    title, fields:[...keys.map(key=>byKey.get(key)).filter(Boolean),
      ...(index === layout.length-1 ? meta.fields.filter(field=>!placed.has(field.key)) : [])],
  }));
}
