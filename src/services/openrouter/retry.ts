const BASE_DELAY_MS = 500;
const MAX_BACKOFF_MS = 8_000;
const MAX_RETRY_AFTER_MS = 60_000;

/**
 * Exponential backoff with "equal" jitter: the delay falls in [50%, 100%] of the exponential
 * step. A server-requested `retry-after` raises the delay, capped at MAX_RETRY_AFTER_MS.
 */
export function backoffDelayMs(
  attempt: number,
  random: () => number,
  retryAfterMs: number | null,
): number {
  const exponential = Math.min(MAX_BACKOFF_MS, BASE_DELAY_MS * 2 ** attempt);
  const jittered = exponential * (0.5 + random() / 2);
  if (retryAfterMs === null) return Math.round(jittered);
  return Math.round(Math.max(jittered, Math.min(retryAfterMs, MAX_RETRY_AFTER_MS)));
}

/** Parses `retry-after` as delta-seconds or an HTTP date. Returns milliseconds or null. */
export function parseRetryAfter(value: string | null, now: () => number): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  if (Number.isNaN(date)) return null;
  return Math.max(0, date - now());
}
