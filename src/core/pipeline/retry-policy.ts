/*
 * Retry policy for chapters that fail with a transient error (no connection, a timeout, a rate
 * limit, a provider 5xx). The queue keeps such a chapter and retries it with exponential backoff,
 * so one flaky chapter neither ends the run nor blocks the chapters behind it.
 */
import type { PipelineError } from '../domain';

/** Delay before the first retry, in milliseconds. Later retries grow by BACKOFF_FACTOR. */
export const TRANSIENT_BASE_DELAY_MS = 5_000;
export const TRANSIENT_MAX_DELAY_MS = 300_000;
const BACKOFF_FACTOR = 3;
/** Each delay is spread by up to this fraction either way, so chapters do not retry in lockstep. */
const JITTER_FRACTION = 0.2;
/** A chapter that fails this many times in a row is given up, with its last error. */
export const MAX_TRANSIENT_FAILURES = 20;

/** A failure the queue may retry. The error's own `retryable` flag decides, so every source agrees. */
export function isTransient(error: PipelineError): boolean {
  return error.retryable;
}

/**
 * The wait before retry number `attempt` (0 for the first). `random` returns a value in [0, 1). The
 * result never exceeds TRANSIENT_MAX_DELAY_MS.
 */
export function transientRetryDelayMs(attempt: number, random: () => number): number {
  const base = Math.min(
    TRANSIENT_MAX_DELAY_MS,
    TRANSIENT_BASE_DELAY_MS * BACKOFF_FACTOR ** Math.max(0, attempt),
  );
  const spread = 1 - JITTER_FRACTION + 2 * JITTER_FRACTION * random();
  return Math.min(TRANSIENT_MAX_DELAY_MS, Math.round(base * spread));
}

/** Runs `run` after `ms`, and returns the function that cancels it. */
export interface Scheduler {
  after(ms: number, run: () => void): () => void;
}

export const TIMER_SCHEDULER: Scheduler = {
  after(ms, run) {
    const handle = setTimeout(run, ms);
    return () => clearTimeout(handle);
  },
};
