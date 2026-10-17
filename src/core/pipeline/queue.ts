/*
 * A serial queue of chapters. One chapter runs at a time, in queue order. The user can move a
 * pending chapter or cancel one. The queue is persisted through the JobStore, so it resumes after an
 * app restart: the chapter that was running is first in the restored queue, and its jobs resume.
 *
 * A transient failure (no connection, a timeout, a rate limit, a provider error) never ends a run.
 * The chapter waits with exponential backoff, moves behind the other chapters, and runs again when
 * its time comes or when `retryNow()` is called. A chapter that keeps failing is given up after
 * MAX_TRANSIENT_FAILURES tries, with its last error.
 */
import { toPipelineError } from './errors';
import {
  isTransient,
  MAX_TRANSIENT_FAILURES,
  TIMER_SCHEDULER,
  transientRetryDelayMs,
} from './retry-policy';
import { runChapter } from './runner';

import type { PipelineEvent } from './context';
import type { PersistedQueueItem, PipelinePorts } from './ports';
import type { Scheduler } from './retry-policy';
import type { RunOptions, RunOutcome } from './runner';

/** Per-chapter options. They are persisted with the queue, so a restored chapter keeps them. */
export type QueueRunOptions = Pick<RunOptions, 'from' | 'force' | 'pdfEngine'>;

/** A chapter that failed transiently and runs again at `retryAt` (epoch milliseconds). */
export interface WaitingChapter {
  readonly chapterId: string;
  /** Transient failures so far, in a row. */
  readonly failures: number;
  readonly retryAt: number;
}

export interface QueueSnapshot {
  /** The chapter running now, or null. */
  readonly running: string | null;
  /** Chapters ready to run, in order. */
  readonly pending: readonly string[];
  /** Chapters waiting to retry after a transient failure, in queue order. */
  readonly waiting: readonly WaitingChapter[];
}

export interface PipelineQueueOptions {
  readonly onEvent?: (event: PipelineEvent) => void;
  /** Wakes the queue when a waiting chapter is due. Defaults to setTimeout. */
  readonly scheduler?: Scheduler;
  /** Jitter source in [0, 1). Defaults to Math.random. */
  readonly random?: () => number;
}

interface Item {
  readonly chapterId: string;
  readonly options: QueueRunOptions;
  controller: AbortController | null;
  /** Transient failures in a row. */
  transientFailures: number;
  /** When a waiting chapter may run again. Null when it may run now. */
  retryAt: number | null;
}

export class PipelineQueue {
  private items: Item[] = [];
  private paused = false;
  private draining: Promise<void> | null = null;
  private persisting: Promise<void> = Promise.resolve();
  private cancelWakeUp: (() => void) | null = null;
  private readonly listeners = new Set<(snapshot: QueueSnapshot) => void>();
  private readonly scheduler: Scheduler;
  private readonly random: () => number;

  constructor(
    private readonly ports: PipelinePorts,
    private readonly options: PipelineQueueOptions = {},
  ) {
    this.scheduler = options.scheduler ?? TIMER_SCHEDULER;
    this.random = options.random ?? Math.random;
  }

  snapshot(): QueueSnapshot {
    const running = this.items.find((item) => item.controller !== null) ?? null;
    const queued = this.items.filter((item) => item.controller === null);
    return {
      running: running?.chapterId ?? null,
      pending: queued.filter((item) => item.retryAt === null).map((item) => item.chapterId),
      waiting: queued.flatMap((item) =>
        item.retryAt === null
          ? []
          : [
              {
                chapterId: item.chapterId,
                failures: item.transientFailures,
                retryAt: item.retryAt,
              },
            ],
      ),
    };
  }

  /**
   * True after a chapter failed with AUTH (no key, or a rejected one). The queue then keeps every
   * chapter and waits for `resume()`, so the chapter can run once the user connects OpenRouter.
   */
  isPaused(): boolean {
    return this.paused;
  }

  /** Clears an AUTH pause and runs the queue again from its first chapter. */
  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.notify();
    this.kick();
  }

  /**
   * Makes every waiting chapter runnable now. The app calls it when it comes to the foreground and
   * when the connection may be back.
   */
  retryNow(): void {
    let changed = false;
    for (const item of this.items) {
      if (item.controller === null && item.retryAt !== null) {
        item.retryAt = null;
        changed = true;
      }
    }
    if (!changed) return;
    this.notify();
    this.kick();
    this.persist().catch(() => undefined);
  }

  /** Calls `listener` now and after each change. Returns the unsubscribe function. */
  subscribe(listener: (snapshot: QueueSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Adds a chapter to the end of the queue. A chapter already queued stays where it is. A waiting
   * chapter that is queued again runs now.
   */
  async enqueue(chapterId: string, options: QueueRunOptions = {}): Promise<void> {
    const existing = this.items.find((item) => item.chapterId === chapterId);
    if (existing) {
      const wasWaiting = existing.retryAt !== null;
      existing.retryAt = null;
      if (wasWaiting) this.notify();
      this.kick();
      if (wasWaiting) await this.persist();
      return;
    }
    this.items.push({ chapterId, options, controller: null, transientFailures: 0, retryAt: null });
    this.notify();
    // The run starts before the save, so `idle()` already reflects the chapter when this returns.
    this.kick();
    await this.persist();
  }

  /** Removes a pending or waiting chapter, or aborts the running one. Its run ends as cancelled. */
  async cancel(chapterId: string): Promise<void> {
    const item = this.items.find((entry) => entry.chapterId === chapterId);
    if (!item) return;
    if (item.controller) {
      item.controller.abort();
      return;
    }
    this.items = this.items.filter((entry) => entry !== item);
    await this.persist();
    this.notify();
  }

  /** Moves a queued chapter (pending or waiting) to `position` among the queued chapters (0 runs next). */
  async moveTo(chapterId: string, position: number): Promise<void> {
    const queued = this.items.filter((item) => item.controller === null);
    const item = queued.find((entry) => entry.chapterId === chapterId);
    if (!item) return;
    const rest = this.items.filter((entry) => entry !== item);
    const runningCount = this.items.length - queued.length;
    const target = Math.min(Math.max(0, position), queued.length - 1);
    this.items = [
      ...rest.slice(0, runningCount + target),
      item,
      ...rest.slice(runningCount + target),
    ];
    await this.persist();
    this.notify();
  }

  /** Re-enqueues the chapters persisted by an earlier session, in their saved order and with their options. */
  async restore(): Promise<void> {
    const saved = await this.ports.jobs.loadQueue();
    for (const entry of saved) {
      if (!this.items.some((item) => item.chapterId === entry.chapterId)) {
        this.items.push({
          chapterId: entry.chapterId,
          options: optionsOf(entry),
          controller: null,
          transientFailures: entry.transientFailures ?? 0,
          retryAt: entry.retryAt ?? null,
        });
      }
    }
    this.notify();
    this.kick();
  }

  /**
   * Resolves when nothing is running and no chapter is due. A waiting chapter does not hold it: its
   * retry is a timer that the queue owns.
   */
  idle(): Promise<void> {
    return this.draining ?? Promise.resolve();
  }

  private kick(): void {
    if (this.draining) return;
    this.draining = this.drain().finally(() => {
      this.draining = null;
    });
  }

  private async drain(): Promise<void> {
    while (!this.paused) {
      const item = this.nextRunnable();
      if (!item) {
        this.armWakeUp();
        return;
      }
      const controller = new AbortController();
      item.controller = controller;
      item.retryAt = null;
      this.notify();
      const outcome = await this.runItem(item, controller.signal);
      item.controller = null;
      if (outcome?.status === 'failed' && outcome.error.code === 'AUTH') {
        // Nothing can run without a key, so the chapter stays first in line for `resume()`.
        this.paused = true;
        this.notify();
        return;
      }
      if (outcome?.status === 'failed' && isTransient(outcome.error)) {
        item.transientFailures += 1;
        if (item.transientFailures < MAX_TRANSIENT_FAILURES) {
          this.waitToRetry(item);
        } else {
          this.items = this.items.filter((entry) => entry !== item);
        }
      } else {
        this.items = this.items.filter((entry) => entry !== item);
      }
      await this.persist();
      this.notify();
    }
  }

  private async runItem(item: Item, signal: AbortSignal): Promise<RunOutcome | null> {
    try {
      return await runChapter(item.chapterId, this.ports, {
        ...item.options,
        signal,
        onEvent: this.options.onEvent,
      });
    } catch (thrown) {
      this.options.onEvent?.({
        type: 'error',
        chapterId: item.chapterId,
        stage: 'extract',
        error: toPipelineError(thrown),
      });
      return null;
    }
  }

  /** The first chapter that may run now, in queue order. */
  private nextRunnable(): Item | null {
    const now = this.ports.clock.now();
    return (
      this.items.find(
        (item) => item.controller === null && (item.retryAt === null || item.retryAt <= now),
      ) ?? null
    );
  }

  /** Keeps a chapter after a transient failure: it waits, and moves behind every other chapter. */
  private waitToRetry(item: Item): void {
    const delay = transientRetryDelayMs(item.transientFailures - 1, this.random);
    item.retryAt = this.ports.clock.now() + delay;
    this.items = [...this.items.filter((entry) => entry !== item), item];
    this.options.onEvent?.({
      type: 'retrying',
      chapterId: item.chapterId,
      attempt: item.transientFailures,
      retryAt: item.retryAt,
    });
  }

  /** Schedules the drain for the earliest waiting chapter, replacing any earlier schedule. */
  private armWakeUp(): void {
    this.cancelWakeUp?.();
    this.cancelWakeUp = null;
    const due = this.items.flatMap((item) =>
      item.controller === null && item.retryAt !== null ? [item.retryAt] : [],
    );
    if (due.length === 0) return;
    const delay = Math.max(0, Math.min(...due) - this.ports.clock.now());
    this.cancelWakeUp = this.scheduler.after(delay, () => {
      this.cancelWakeUp = null;
      this.kick();
    });
  }

  private persist(): Promise<void> {
    const entries: PersistedQueueItem[] = this.items.map((item) => ({
      chapterId: item.chapterId,
      ...item.options,
      ...(item.transientFailures > 0 ? { transientFailures: item.transientFailures } : {}),
      ...(item.retryAt === null ? {} : { retryAt: item.retryAt }),
    }));
    const next = this.persisting.then(() => this.ports.jobs.saveQueue(entries));
    // Each save reports its own failure, and a failed save does not block the ones after it.
    this.persisting = next.catch(() => undefined);
    return next;
  }

  private notify(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}

/** The run options carried by a persisted entry. Unknown keys are not copied. */
function optionsOf(entry: PersistedQueueItem): QueueRunOptions {
  return {
    ...(entry.from === undefined ? {} : { from: entry.from }),
    ...(entry.force === undefined ? {} : { force: entry.force }),
    ...(entry.pdfEngine === undefined ? {} : { pdfEngine: entry.pdfEngine }),
  };
}

export function createPipelineQueue(
  ports: PipelinePorts,
  options: PipelineQueueOptions = {},
): PipelineQueue {
  return new PipelineQueue(ports, options);
}
