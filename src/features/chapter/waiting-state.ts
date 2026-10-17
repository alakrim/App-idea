/*
 * The countdown a waiting chapter shows: "Waiting for connection · retrying in 0:42". Pure, so the
 * rounding and the floor are tested without a clock.
 */

/** Milliseconds until `retryAt`, never negative. */
export function remainingMs(retryAt: number, now: number): number {
  return Math.max(0, retryAt - now);
}

/**
 * "0:42" for 42 seconds, "1:05" for 65. The count rounds up, so a retry that is still pending never
 * shows "0:00".
 */
export function formatCountdown(ms: number): string {
  const totalSeconds = Math.ceil(Math.max(0, ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
