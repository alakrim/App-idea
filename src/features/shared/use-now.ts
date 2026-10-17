import { useEffect, useState } from 'react';

/**
 * The current time, refreshed every `intervalMs` while `enabled` is true. Live labels, such as a
 * step's elapsed time, read it. Off, no timer is set and the time stays where it was last read.
 */
export function useNow(intervalMs: number, enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return undefined;
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [enabled, intervalMs]);
  return now;
}
