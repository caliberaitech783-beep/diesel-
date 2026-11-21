export function pulseMasterExport(master, records) {
  const codeField = master.columns[0][0];
  return {
    columns: master.columns.map(([, label]) => label),
    showSite: false,
    records: records.map(record => ({
      master: master.name,
      code: record[codeField],
      fields: master.columns.map(([key, label]) => [label, record[key]]),
    })),
  };
}
