// A single polling loop per register; visibility, focus and reconnection share the same request.
export function createLiveRefresh({ load, apply, onError, visible, schedule = setTimeout, cancel = clearTimeout, interval = 30_000 }) {
  let pending = false;
  let stopped = false;
  let timer;

  async function refresh() {
    if (stopped || pending) return;
    cancel(timer);
    try {
      if (!visible()) return;
      pending = true;
      const page = await load();
      if (!stopped && visible()) apply(page);
    } catch (error) {
      if (!stopped) onError(error);
    } finally {
      pending = false;
      if (!stopped) timer = schedule(refresh, interval);
    }
  }

  // The server already rendered fresh records. Start polling after the first interval.
  timer = schedule(refresh, interval);
  return {
    refresh,
    stop() { stopped = true; cancel(timer); },
  };
}
