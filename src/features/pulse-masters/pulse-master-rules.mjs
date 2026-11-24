import { pulseMasters } from './pulse-master-catalog.mjs';
import { canonicalSite } from './site-names.mjs';

const maximumRecords = 50_000;
const text = value => (typeof value === 'string' || typeof value === 'number' ? String(value) : '')
  .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').trim().slice(0, 1024);

// Keeps the listed columns of each Pulse master. A missing or malformed master rejects the whole copy.
export function readPulseMasters(payload) {
  const copy = {};
  for (const { slug, columns, optional } of pulseMasters) {
    const records = payload?.masters?.[slug] ?? (optional && payload?.masters ? [] : undefined);
    if (!Array.isArray(records) || records.length > maximumRecords) throw new Error('Pulse did not send the ' + slug + ' master.');
    copy[slug] = records.filter(record => record && typeof record === 'object')
      .map(record => Object.fromEntries(columns.map(([key]) => [key, text(record[key])])));
  }
  return copy;
}

// Rows a person adds by hand or from a file: the listed columns only, cleaned the same way as the Pulse copy.
export function readAddedRecords(master, rows) {
  if (!Array.isArray(rows) || !rows.length) throw new Error('There are no records to add.');
  if (rows.length > 5000) throw new Error('Add up to 5,000 records at a time.');
  const records = rows.filter(row => row && typeof row === 'object')
    .map(row => Object.fromEntries(master.columns.map(([key]) => [key, text(row[key])])))
    .filter(record => Object.values(record).some(Boolean));
  const [key, label] = master.columns[0];
  if (!records.length || records.some(record => !record[key])) throw new Error('Every record needs ' + label + '.');
  return records;
}

// A site-assigned Master Data role sees its own site's equipment and people, however the site is spelt.
export function forSite(master, records, sites) {
  const keys = new Set((sites ?? []).map(canonicalSite).filter(Boolean));
  if (!master.siteColumn || !keys.size) return records;
  return records.filter(record => keys.has(canonicalSite(record[master.siteColumn])));
}

export function matching(master, records, search) {
  const words = String(search ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return records;
  return records.filter(record => {
    const line = master.columns.map(([key]) => record[key]).join(' ').toLowerCase();
    return words.every(word => line.includes(word));
  });
}
