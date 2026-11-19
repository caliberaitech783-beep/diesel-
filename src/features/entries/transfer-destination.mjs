export const transferKey = (site, storage) => JSON.stringify([site, storage]);

export function transferOptions(config) {
  return config.destinations.filter(site => site.item.code === config.item.code).flatMap(destination =>
    destination.storage.map(storage => ({
      site: destination.site, code: storage.code, key: transferKey(destination.site, storage.code),
      label: destination.site + ' · ' + storage.code + ' · ' + storage.name, businessDay: destination.businessDay,
    })));
}

export function transferTarget(config, value, previousSite) {
  const options = transferOptions(config);
  const exact = options.find(option => option.key === value);
  if (exact) return exact;
  // Older E12 records stored just the storage code. Use the saved destination when available.
  const legacy = options.filter(option => option.code === value && (!previousSite || option.site === previousSite));
  return legacy.length === 1 ? legacy[0] : null;
}

export function transferLabel(value, site) {
  if (!site) return value;
  if (typeof value === 'string' && value.startsWith('["')) {
    try {
      const [target, code] = JSON.parse(value);
      if (target === site && typeof code === 'string') return site + ' · ' + code;
    } catch { /* Older records contain a plain code. */ }
  }
  return site + ' · ' + value;
}
