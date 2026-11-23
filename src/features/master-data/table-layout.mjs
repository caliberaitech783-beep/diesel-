// Long values keep the full card width on phones; short values share a row.
export const tableCellAttributes = value => String(value ?? '').length > 36 || /\n/.test(String(value ?? '')) ? ' data-wide="true"' : '';
