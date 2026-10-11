/*
 * Tells a daily free-model limit from a per-minute one. OpenRouter names the window in the error
 * text ("free-models-per-day") and reports it in the X-RateLimit-* headers. A window that resets
 * more than a minute away cannot be waited out by a retry, so it is not retried.
 */

/** Only the header reads the check needs, so tests can pass a plain map. */
export interface HeaderReader {
  get(name: string): string | null;
}

const DAILY_TEXT_PATTERN = /free-models-per-day|per[- ]day/i;
/** A reset further away than this is a daily window, not a per-minute one. */
const DAILY_RESET_MIN_MS = 60_000;

/**
 * True when a 429 is the daily allowance of a free model. `X-RateLimit-Reset` is read as epoch
 * milliseconds, which is how OpenRouter reports it.
 */
export function isDailyLimit(bodyText: string, headers: HeaderReader, now: number): boolean {
  if (DAILY_TEXT_PATTERN.test(bodyText)) return true;
  const remaining = headers.get('x-ratelimit-remaining');
  const reset = Number(headers.get('x-ratelimit-reset'));
  return remaining === '0' && Number.isFinite(reset) && reset - now > DAILY_RESET_MIN_MS;
}
