// Book stock per storage location against the approved Storage Location Master minimum level.
export function lowStorage(balances, approvedStorage) {
  const minimums = new Map(approvedStorage.map(location=>[location.code,location.minimum]));
  return balances.flatMap(({ code, litres }) => {
    const minimum = minimums.get(code);
    return Number.isFinite(minimum) && minimum>0 && litres<minimum ? [{ code, litres, minimum }] : [];
  });
}
