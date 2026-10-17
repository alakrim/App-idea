/*
 * The line the processing notification shows, and the throttle that keeps its updates to one a
 * second. Pure: the controller feeds it the pipeline's progress and the scheduler's timers.
 */
import type { ProcessingNotice } from '@/services/background';

import { STAGE_VERBS } from './stage-verbs';

import type { ChapterProgress } from './facade';

/** The shortest gap between two notification updates. */
export const NOTICE_INTERVAL_MS = 1_000;

/** The notification's content for a chapter's progress. */
export function noticeOf(progress: ChapterProgress, title: string): ProcessingNotice {
  return {
    chapterId: progress.chapterId,
    title,
    text: noticeText(progress),
    progress: progress.overall,
  };
}

/** "Narrating · 40%", "Waiting for connection", or "Queued" when no stage has started. */
export function noticeText(progress: ChapterProgress): string {
  if (progress.state === 'waiting') return 'Waiting for connection';
  const active = progress.stages.find((stage) => stage.status === 'running');
  if (active) return `${STAGE_VERBS[active.stage]} · ${Math.round(active.progress * 100)}%`;
  return 'Queued';
}

export interface Throttle<T> {
  /** Sends `value` now when the interval has passed, or else at its end, with the latest value. */
  push(value: T): void;
  /** Drops the value waiting to be sent. */
  cancel(): void;
}

export interface ThrottleOptions<T> {
  readonly intervalMs: number;
  readonly now: () => number;
  /** Runs `run` after `ms`, and returns the function that cancels it. */
  readonly schedule: (ms: number, run: () => void) => () => void;
  readonly send: (value: T) => void;
}

/**
 * Leading and trailing throttle. The first value goes out at once. Values that arrive inside the
 * interval are coalesced, and the latest one goes out when the interval ends, so the final state is
 * never lost.
 */
export function createThrottle<T>(options: ThrottleOptions<T>): Throttle<T> {
  let lastSentAt: number | null = null;
  let pending: { readonly value: T } | null = null;
  let cancelTimer: (() => void) | null = null;

  const flush = (): void => {
    if (pending === null) return;
    const { value } = pending;
    pending = null;
    lastSentAt = options.now();
    options.send(value);
  };

  return {
    push(value) {
      pending = { value };
      const elapsed = lastSentAt === null ? Infinity : options.now() - lastSentAt;
      if (elapsed >= options.intervalMs) {
        cancelTimer?.();
        cancelTimer = null;
        flush();
        return;
      }
      if (cancelTimer === null) {
        cancelTimer = options.schedule(options.intervalMs - elapsed, () => {
          cancelTimer = null;
          flush();
        });
      }
    },
    cancel() {
      cancelTimer?.();
      cancelTimer = null;
      pending = null;
    },
  };
}
