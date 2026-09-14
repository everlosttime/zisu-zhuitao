export type ConnectionWatchdog = {
  finish: () => boolean;
  readonly pending: boolean;
};

export function createConnectionWatchdog(timeoutMs: number, onTimeout: () => void): ConnectionWatchdog {
  let pending = true;
  const timer = setTimeout(() => {
    if (!pending) return;
    pending = false;
    onTimeout();
  }, timeoutMs);

  return {
    finish() {
      if (!pending) return false;
      pending = false;
      clearTimeout(timer);
      return true;
    },
    get pending() {
      return pending;
    },
  };
}
