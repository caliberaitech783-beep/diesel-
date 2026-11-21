// One identity per site, however it is spelt. These are Pulse's own rules (its site-location aliases), so a
// name from the ERP such as "GOURI POUNI OB (2ND)" or "Dudhichua West OB" lands on the Pulse site it means.
const aliases = new Map([
  ['sasti ii', 'sasti ob'], ['sasti', 'sasti ob'],
  ['majri', 'majri ob'], ['majri ii', 'majri ob'], ['majri o b', 'majri ob'],
  ['dhoptala ii', 'dhoptala ob 2nd'], ['dhoptala ob', 'dhoptala ob 2nd'],
  ['gauri pauni', 'gauri pauni ob 2nd'], ['gouri ob', 'gauri pauni ob 2nd'], ['gouri pouni', 'gauri pauni ob 2nd'],
  ['gouri pouni ob 2nd', 'gauri pauni ob 2nd'],
  ['lalpeth', 'lalpeth ob'], ['lalpeth ii', 'lalpeth ob'],
  ['jayant', 'jayant ob'], ['jayant ob 2nd', 'jayant ob'], ['jayant 2nd', 'jayant ob'], ['jayant ob 2', 'jayant ob'],
  ['jayant ii', 'jayant ob'], ['jayant ob ii', 'jayant ob'],
  ['dudhichua west', 'dudhichua ob'], ['dudhichua west ob', 'dudhichua ob'], ['dudhicua west ob', 'dudhichua ob'],
  ['dudhichua east', 'dudhichua east ob'], ['dudhicua east ob', 'dudhichua east ob'],
]);

// "" for a blank value. "OC" and "OB" are the same pit, and brackets and case do not matter.
export function canonicalSite(value) {
  const name = String(value ?? '').trim().normalize('NFKC').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\boc\b/g, 'ob').trim().replace(/\s+/g, ' ');
  return aliases.get(name) ?? name;
}
