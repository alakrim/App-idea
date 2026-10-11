/** The master volume fades over this long before playback pauses. */
export const SLEEP_FADE_MS = 10_000;
export const MAX_SLEEP_MINUTES = 240;

export type SleepTimerMode = 'off' | 'minutes' | 'endOfChapter';

export interface SleepTimer {
  mode: SleepTimerMode;
  /** Epoch ms when a minutes timer fades out. Null for `off` and `endOfChapter`. */
  endsAt: number | null;
}

export const SLEEP_TIMER_OFF: SleepTimer = { mode: 'off', endsAt: null };

/** A timer that fades out and pauses after `minutes`, counted from `now`. */
export function minutesSleepTimer(now: number, minutes: number): SleepTimer {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_SLEEP_MINUTES) {
    throw new RangeError(`minutes must be an integer from 1 to ${MAX_SLEEP_MINUTES}, got ${minutes}`);
  }
  return { mode: 'minutes', endsAt: now + minutes * 60_000 };
}

/** A timer that fades out over the last 10 s of the chapter and then pauses. */
export const END_OF_CHAPTER_SLEEP_TIMER: SleepTimer = { mode: 'endOfChapter', endsAt: null };

export type SleepPhase =
  | { kind: 'idle' }
  /** The master volume should be set to `gain` (0 to 1). */
  | { kind: 'fading'; gain: number }
  /** Pause now and clear the timer. The master volume returns to 1 for the next play. */
  | { kind: 'pause' };

/**
 * What the sleep timer asks the player to do at `now`. `remainingChapterMs` is null when the
 * chapter length is not yet known (progressive playback), which keeps an end-of-chapter timer
 * idle until the length is known.
 */
export function sleepPhase(
  timer: SleepTimer,
  now: number,
  remainingChapterMs: number | null,
): SleepPhase {
  if (timer.mode === 'minutes' && timer.endsAt !== null) {
    const elapsed = now - timer.endsAt;
    if (elapsed < 0) return { kind: 'idle' };
    if (elapsed >= SLEEP_FADE_MS) return { kind: 'pause' };
    return { kind: 'fading', gain: 1 - elapsed / SLEEP_FADE_MS };
  }
  if (timer.mode === 'endOfChapter' && remainingChapterMs !== null) {
    if (remainingChapterMs > SLEEP_FADE_MS) return { kind: 'idle' };
    if (remainingChapterMs <= 0) return { kind: 'pause' };
    return { kind: 'fading', gain: remainingChapterMs / SLEEP_FADE_MS };
  }
  return { kind: 'idle' };
}
