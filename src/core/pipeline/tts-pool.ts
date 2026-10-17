/*
 * The narration request pool (ADR-0008). Segments are synthesized in a sliding window instead of
 * lock-step pairs, so one slow request no longer holds back the others.
 *
 * Two parts:
 * - `AdaptiveWindow` decides how many segments may be outstanding. It starts at 3, adds one after 4
 *   straight successes up to a ceiling (6 by default, or the narrator's own concurrency), and halves
 *   on congestion (a rate limit or an overload). The free narrator is held to one at a time.
 * - `SlidingWindow` runs the requests. Results can finish in any order, but `save` is called strictly
 *   in submission order, so the saved segments are always a contiguous prefix. A finished segment waits
 *   in memory until its predecessors are saved. A segment that failed, or that waits behind a failure,
 *   is never saved, which is why a failure cannot leave an orphan audio file.
 *
 * The window bounds outstanding work (submitted but not yet saved), so memory stays bounded too.
 */

import { delay } from './abort';
import { toPipelineError } from './errors';
import { throwIfCancelled } from '../llm/transport';

export const WINDOW_START = 3;
export const WINDOW_MAX = 6;
export const WINDOW_MIN = 1;
/** Straight successes needed before the window grows by one. */
export const WINDOW_GROW_AFTER = 4;
/** Times one segment is retried after congestion before the run fails. */
export const CONGESTION_RETRIES = 4;
const BACKOFF_BASE_MS = 2_000;
const BACKOFF_MAX_MS = 30_000;

export interface AdaptiveWindowOptions {
  /**
   * The most requests in flight at once, from 1 to WINDOW_MAX. Each narrator sets its own (the free
   * one is held to 1). Defaults to WINDOW_MAX.
   */
  readonly ceiling?: number;
}

/** The additive-increase, multiplicative-decrease rule for the number of outstanding segments. */
export class AdaptiveWindow {
  private readonly ceiling: number;
  private current: number;
  private successes = 0;

  constructor(options: AdaptiveWindowOptions = {}) {
    this.ceiling = Math.max(WINDOW_MIN, Math.min(WINDOW_MAX, options.ceiling ?? WINDOW_MAX));
    this.current = Math.min(WINDOW_START, this.ceiling);
  }

  get limit(): number {
    return this.current;
  }

  onSuccess(): void {
    this.successes += 1;
    if (this.successes < WINDOW_GROW_AFTER) return;
    this.successes = 0;
    this.current = Math.min(this.ceiling, this.current + 1);
  }

  onCongestion(): void {
    this.successes = 0;
    this.current = Math.max(WINDOW_MIN, Math.floor(this.current / 2));
  }
}

/** A rate limit or an overload from the provider. These are retryable, unlike a bad request. */
export function isCongestion(thrown: unknown): boolean {
  const error = toPipelineError(thrown);
  return (error.code === 'RATE_LIMITED' || error.code === 'UNKNOWN') && error.retryable;
}

/** Exponential backoff before a congestion retry, capped. */
export function backoffMs(attempt: number): number {
  return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (attempt - 1));
}

export interface SegmentTiming {
  /** Wall-clock time of the successful request, from the injected clock. */
  readonly synthMs: number;
  /** The window size when the request was started. */
  readonly slots: number;
}

export interface SlidingWindowOptions<T, R> {
  readonly window: AdaptiveWindow;
  /** The run's signal. Aborting it cancels every request. */
  readonly signal: AbortSignal;
  readonly now: () => number;
  /** Waits before a congestion retry. Defaults to an abortable timer. */
  readonly wait?: (ms: number, signal: AbortSignal) => Promise<void>;
  readonly work: (item: T, signal: AbortSignal) => Promise<R>;
  /** Called once per item, strictly in submission order. */
  readonly save: (item: T, result: R, timing: SegmentTiming) => Promise<void>;
}

interface Finished<T, R> {
  readonly item: T;
  readonly result: R;
  readonly timing: SegmentTiming;
}

export class SlidingWindow<T, R> {
  private submitted = 0;
  private saved = 0;
  private readonly finished = new Map<number, Finished<T, R>>();
  private readonly tasks = new Set<Promise<void>>();
  private readonly abort = new AbortController();
  private readonly wait: (ms: number, signal: AbortSignal) => Promise<void>;
  private failure: { readonly error: unknown } | null = null;
  private saving: Promise<void> = Promise.resolve();
  private waiters: (() => void)[] = [];

  constructor(private readonly options: SlidingWindowOptions<T, R>) {
    this.wait = options.wait ?? delay;
    if (options.signal.aborted) this.abort.abort();
    else options.signal.addEventListener('abort', () => this.abort.abort(), { once: true });
  }

  /** Starts `item` once the window has a free slot. Rejects with the first failure of the pool. */
  async submit(item: T): Promise<void> {
    while (this.submitted - this.saved >= this.options.window.limit) {
      this.throwIfFailed();
      await this.nextChange();
    }
    this.throwIfFailed();
    throwIfCancelled(this.options.signal);
    const index = this.submitted;
    const slots = this.options.window.limit;
    this.submitted += 1;
    const task: Promise<void> = this.run(index, item, slots).finally(() => {
      this.tasks.delete(task);
    });
    this.tasks.add(task);
  }

  /** Waits until every submitted item is settled. Rejects with the first failure, if there was one. */
  async finish(): Promise<void> {
    while (this.tasks.size > 0) await Promise.all([...this.tasks]);
    this.throwIfFailed();
  }

  private async run(index: number, item: T, slots: number): Promise<void> {
    let attempt = 0;
    for (;;) {
      const started = this.options.now();
      let result: R;
      try {
        result = await this.options.work(item, this.abort.signal);
      } catch (thrown) {
        if (!this.canRetry(thrown, attempt)) {
          this.fail(thrown);
          return;
        }
        attempt += 1;
        this.options.window.onCongestion();
        try {
          await this.wait(backoffMs(attempt), this.abort.signal);
        } catch (aborted) {
          this.fail(aborted);
          return;
        }
        continue;
      }
      this.options.window.onSuccess();
      const timing: SegmentTiming = { synthMs: this.options.now() - started, slots };
      this.finished.set(index, { item, result, timing });
      try {
        await this.flush();
      } catch (thrown) {
        this.fail(thrown);
      }
      return;
    }
  }

  private canRetry(thrown: unknown, attempt: number): boolean {
    return (
      this.failure === null &&
      !this.abort.signal.aborted &&
      attempt < CONGESTION_RETRIES &&
      isCongestion(thrown)
    );
  }

  /** Saves finished items in order. Serialized, so two saves never overlap. */
  private flush(): Promise<void> {
    this.saving = this.saving.catch(() => undefined).then(() => this.drain());
    return this.saving;
  }

  private async drain(): Promise<void> {
    for (;;) {
      if (this.failure !== null) return;
      const next = this.finished.get(this.saved);
      if (!next) return;
      this.finished.delete(this.saved);
      await this.options.save(next.item, next.result, next.timing);
      this.saved += 1;
      this.notify();
    }
  }

  private fail(error: unknown): void {
    this.failure ??= { error };
    this.abort.abort();
    this.notify();
  }

  private throwIfFailed(): void {
    if (this.failure !== null) throw this.failure.error;
  }

  private nextChange(): Promise<void> {
    return new Promise<void>((resolve) => this.waiters.push(resolve));
  }

  private notify(): void {
    const waiting = this.waiters;
    this.waiters = [];
    for (const resolve of waiting) resolve();
  }
}
