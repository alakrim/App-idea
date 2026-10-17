/**
 * Playback health: how often narration gaps, buffers, runs dry or is paused by the system. Pure:
 * the clock is injected, so the rolling summary is tested without any native audio code.
 */

/** The summary covers the last hour at most. */
export const HEALTH_WINDOW_MS = 60 * 60 * 1000;
/** Each kind of sample keeps at most this many recent entries, so a runaway loop cannot grow memory. */
const MAX_SAMPLES = 500;
const MS_PER_MINUTE = 60_000;

export interface GapStats {
  count: number;
  p50Ms: number | null;
  p95Ms: number | null;
  maxMs: number | null;
}

export interface PlaybackHealthSummary {
  /** How long the log has been observing, capped at the window. */
  observedMs: number;
  /**
   * Gaps at segment boundaries: from the outgoing segment's end to the incoming segment playing.
   * With a pre-roll the end is the predicted one, so a negative gap is an overlap of speech.
   */
  boundaries: GapStats;
  /** Times the voice went into buffering. */
  bufferingStarts: number;
  /** Buffering starts per observed minute, or null before any time has passed. */
  bufferingPerMinute: number | null;
  /** Times the voice ran out of audio before the chapter was complete. */
  runDry: number;
  /** Times the system paused narration while the listener wanted it playing (focus loss, call). */
  focusLossPauses: number;
}

export interface PlaybackHealthLog {
  /**
   * A boundary opens. `endsInMs` is how long the outgoing segment still has to play: 0 when it has
   * just finished, or the predicted remainder when a pre-roll starts the incoming segment early.
   */
  boundaryStarted(endsInMs: number): void;
  /** The audible segment is playing with its position advancing. Closes the open boundary, if any. */
  boundaryPlaying(): void;
  bufferingStarted(): void;
  ranDry(): void;
  focusLossPaused(): void;
  summary(): PlaybackHealthSummary;
}

export interface PlaybackHealthOptions {
  now: () => number;
  windowMs?: number;
}

interface Timed {
  at: number;
  /** For gaps, the gap in milliseconds. Counters carry 0. */
  value: number;
}

/** Nearest-rank percentile of an ascending list. */
function percentile(sorted: readonly number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const rank = Math.min(sorted.length, Math.max(1, Math.ceil(p * sorted.length)));
  return sorted[rank - 1] ?? null;
}

function gapStats(gaps: readonly number[]): GapStats {
  const sorted = [...gaps].sort((a, b) => a - b);
  return {
    count: sorted.length,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    maxMs: sorted.at(-1) ?? null,
  };
}

function pushCapped(list: Timed[], entry: Timed): void {
  list.push(entry);
  if (list.length > MAX_SAMPLES) list.shift();
}

function pruneBefore(list: Timed[], cutoff: number): void {
  while (list.length > 0 && (list[0]?.at ?? 0) < cutoff) list.shift();
}

export function createPlaybackHealthLog(options: PlaybackHealthOptions): PlaybackHealthLog {
  const { now } = options;
  const windowMs = options.windowMs ?? HEALTH_WINDOW_MS;
  const startedAt = now();
  let openBoundaryAt: number | null = null;
  const gaps: Timed[] = [];
  const bufferingStarts: Timed[] = [];
  const runDry: Timed[] = [];
  const focusLossPauses: Timed[] = [];

  return {
    boundaryStarted(endsInMs) {
      // The first start wins: an earlier pre-roll predicts the same end, and a re-arm must not move it.
      openBoundaryAt ??= now() + Math.max(0, endsInMs);
    },
    boundaryPlaying() {
      if (openBoundaryAt === null) return;
      const at = now();
      pushCapped(gaps, { at, value: at - openBoundaryAt });
      openBoundaryAt = null;
    },
    bufferingStarted() {
      pushCapped(bufferingStarts, { at: now(), value: 0 });
    },
    ranDry() {
      pushCapped(runDry, { at: now(), value: 0 });
    },
    focusLossPaused() {
      pushCapped(focusLossPauses, { at: now(), value: 0 });
    },
    summary() {
      const at = now();
      const cutoff = at - windowMs;
      for (const list of [gaps, bufferingStarts, runDry, focusLossPauses]) {
        pruneBefore(list, cutoff);
      }
      const observedMs = Math.min(windowMs, Math.max(0, at - startedAt));
      const bufferingCount = bufferingStarts.length;
      return {
        observedMs,
        boundaries: gapStats(gaps.map((gap) => gap.value)),
        bufferingStarts: bufferingCount,
        bufferingPerMinute: observedMs > 0 ? bufferingCount / (observedMs / MS_PER_MINUTE) : null,
        runDry: runDry.length,
        focusLossPauses: focusLossPauses.length,
      };
    },
  };
}
