/*
 * A serial queue of chapters. One chapter runs at a time, in queue order. The user can move a
 * pending chapter or cancel one. The queue is persisted through the JobStore, so it resumes after an
 * app restart: the chapter that was running is first in the restored queue, and its jobs resume.
 */
import { toPipelineError } from './errors';
import { runChapter } from './runner';

import type { PipelineEvent } from './context';
import type { PersistedQueueItem, PipelinePorts } from './ports';
import type { RunOptions, RunOutcome } from './runner';

/** Per-chapter options. They are persisted with the queue, so a restored chapter keeps them. */
export type QueueRunOptions = Pick<RunOptions, 'from' | 'force' | 'pdfEngine'>;

export interface QueueSnapshot {
  /** The chapter running now, or null. */
  readonly running: string | null;
  /** Chapters waiting, in order. */
  readonly pending: readonly string[];
}

export interface PipelineQueueOptions {
  readonly onEvent?: (event: PipelineEvent) => void;
}

interface Item {
  readonly chapterId: string;
  readonly options: QueueRunOptions;
  controller: AbortController | null;
}

export class PipelineQueue {
  private items: Item[] = [];
  private paused = false;
  private draining: Promise<void> | null = null;
  private persisting: Promise<void> = Promise.resolve();
  private readonly listeners = new Set<(snapshot: QueueSnapshot) => void>();

  constructor(
    private readonly ports: PipelinePorts,
    private readonly options: PipelineQueueOptions = {},
  ) {}

  snapshot(): QueueSnapshot {
    const running = this.items.find((item) => item.controller !== null) ?? null;
    return {
      running: running?.chapterId ?? null,
      pending: this.items.filter((item) => item.controller === null).map((i) => i.chapterId),
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

  /** Calls `listener` now and after each change. Returns the unsubscribe function. */
  subscribe(listener: (snapshot: QueueSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Adds a chapter to the end of the queue. A chapter already queued stays where it is. */
  async enqueue(chapterId: string, options: QueueRunOptions = {}): Promise<void> {
    if (this.items.some((item) => item.chapterId === chapterId)) {
      this.kick();
      return;
    }
    this.items.push({ chapterId, options, controller: null });
    this.notify();
    // The run starts before the save, so `idle()` already reflects the chapter when this returns.
    this.kick();
    await this.persist();
  }

  /** Removes a pending chapter, or aborts the running one. Its run ends as cancelled. */
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

  /** Moves a pending chapter to `position` among the pending chapters (0 runs next). */
  async moveTo(chapterId: string, position: number): Promise<void> {
    const pending = this.items.filter((item) => item.controller === null);
    const item = pending.find((entry) => entry.chapterId === chapterId);
    if (!item) return;
    const rest = this.items.filter((entry) => entry !== item);
    const runningCount = this.items.length - pending.length;
    const target = Math.min(Math.max(0, position), pending.length - 1);
    const reordered = [
      ...rest.slice(0, runningCount + target),
      item,
      ...rest.slice(runningCount + target),
    ];
    this.items = reordered;
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
        });
      }
    }
    this.notify();
    this.kick();
  }

  /** Resolves when the queue is empty and nothing is running. */
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
    while (!this.paused && this.items.length > 0) {
      const item = this.items[0];
      if (!item) break;
      item.controller = new AbortController();
      this.notify();
      let outcome: RunOutcome | null = null;
      try {
        outcome = await runChapter(item.chapterId, this.ports, {
          ...item.options,
          signal: item.controller.signal,
          onEvent: this.options.onEvent,
        });
      } catch (thrown) {
        this.options.onEvent?.({
          type: 'error',
          chapterId: item.chapterId,
          stage: 'extract',
          error: toPipelineError(thrown),
        });
      }
      item.controller = null;
      if (outcome?.status === 'failed' && outcome.error.code === 'AUTH') {
        // Nothing can run without a key, so the chapter stays first in line for `resume()`.
        this.paused = true;
        this.notify();
        break;
      }
      this.items = this.items.filter((entry) => entry !== item);
      await this.persist();
      this.notify();
    }
  }

  private persist(): Promise<void> {
    const entries: PersistedQueueItem[] = this.items.map((item) => ({
      chapterId: item.chapterId,
      ...item.options,
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
