import { useEffect, useState } from 'react';

/**
 * The current time, refreshed every `intervalMs` while `enabled` is true. Live labels, such as a
 * step's elapsed time, read it. Off, it stays at the time it last ran and no timer is set.
 */
export function useNow(intervalMs: number, enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [enabled, intervalMs]);
  return now;
}
