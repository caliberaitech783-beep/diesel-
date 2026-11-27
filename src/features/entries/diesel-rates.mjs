// The Diesel Rate Master as the purchase order reads it: one plain row per saved record, rates in ₹ per litre.
import { accountVendors } from './account-vendors.mjs';

const text = value => String(value ?? '').trim();
const amount = value => text(value) === '' || !Number.isFinite(Number(value)) ? undefined : Number(value);

export function dieselRateRows(records) {
  // The master may hold the vendor's account code; the order holds the vendor's name.
  const byCode = new Map(accountVendors.map(vendor => [text(vendor.code).toLowerCase(), vendor.name]));
  return (records ?? []).filter(record => record?.values && record.status !== 'deleted').map(({ values: v }) => ({
    supplier: byCode.get(text(v.Supplier).toLowerCase()) ?? text(v.Supplier), location: text(v.Location), depot: text(v.Depot),
    from: text(v['Effective from']), to: text(v['Effective to']),
    basic: amount(v['Basic rate (₹/Ltr)']), diesel: amount(v['Diesel rate (₹/Ltr), worked out']),
    freight: amount(v['Freight rate (₹/Ltr)'] ?? v['Transportation rate (₹/Ltr)']),
    gross: amount(v['Gross landed cost (₹/Ltr)']), net: amount(v['Net landed cost (₹/Ltr)']),
  })).filter(row => row.supplier && row.diesel > 0);
}
