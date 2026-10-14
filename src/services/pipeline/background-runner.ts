/*
 * Keeps the app's chapter preparation alive while the app is in the background. When the queue has
 * work and the app is in the foreground, it starts a platform foreground service. The service's task
 * awaits the queue's idle promise: the pipeline keeps running in the same JS runtime, and the task
 * only keeps the process and its timers alive. The service stops when the queue is idle or paused.
 *
 * The notification shows the running chapter's title and its step, and it is updated at most once
 * every NOTIFICATION_INTERVAL_MS. A start that the platform refuses is reported in the status (the
 * app then degrades to foreground-only work) and never throws. Nothing here imports a native module:
 * the platform service is a port, and the composition root supplies the adapter.
 */
import type { QueueSnapshot } from '@/core/pipeline/queue';
import type { ChapterProgress } from '@/features/pipeline/facade';

import { notificationOf } from './background-notification';
import { createThrottledTask } from './throttled-task';

import type { ForegroundNotification } from './background-notification';
import type { ForegroundStatusStore } from './foreground-status';
import type { TimerPort } from './throttled-task';

/** The notification is updated at most this often, so the platform is not flooded. */
export const NOTIFICATION_INTERVAL_MS = 2_000;

/** A platform foreground service. Adapters wrap the native library; tests pass fakes. */
export interface ForegroundServicePort {
  /** False where no foreground service exists (iOS, web). Every call then does nothing. */
  readonly supported: boolean;
  /** Starts the service. `task` must stay pending while the service should run. Rejects on refusal. */
  start(task: () => Promise<void>, notification: ForegroundNotification): Promise<void>;
  update(notification: ForegroundNotification): Promise<void>;
  stop(): Promise<void>;
}

export interface QueueView {
  subscribe(listener: (snapshot: QueueSnapshot) => void): () => void;
  isPaused(): boolean;
  idle(): Promise<void>;
}

export interface ProgressView {
  subscribe(chapterId: string, listener: (progress: ChapterProgress) => void): () => void;
}

export interface AppForegroundPort {
  isActive(): boolean;
  /** Calls the listener with true when the app comes to the foreground, and false when it leaves. */
  subscribe(listener: (active: boolean) => void): () => void;
}

export interface BackgroundRunnerDeps {
  readonly queue: QueueView;
  readonly progress: ProgressView;
  readonly status: ForegroundStatusStore;
  readonly service: ForegroundServicePort;
  readonly app: AppForegroundPort;
  readonly titleOf: (chapterId: string) => string | null;
  readonly now: () => number;
  readonly timers: TimerPort;
}

export interface BackgroundRunner {
  /** Stops the service, and detaches from the queue and the app. */
  dispose(): void;
}

function failureTextOf(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.trim().slice(0, 200) || 'The platform refused the service.';
}

export function createBackgroundRunner(deps: BackgroundRunnerDeps): BackgroundRunner {
  const { queue, progress, status, service, app, now } = deps;
  let snapshot: QueueSnapshot = { running: null, pending: [] };
  let watched: string | null = null;
  let unwatch: () => void = () => undefined;
  let latest: ChapterProgress | null = null;
  /** Bumped by every stop, so a start that completes after a stop is undone. */
  let generation = 0;

  const notification = (): ForegroundNotification => {
    const chapterId = snapshot.running ?? snapshot.pending[0] ?? null;
    return notificationOf({
      title: chapterId === null ? null : deps.titleOf(chapterId),
      progress: latest,
    });
  };

  const pushUpdate = (): void => {
    if (status.get().state !== 'running') return;
    service.update(notification()).catch(() => undefined);
  };
  const throttle = createThrottledTask({
    intervalMs: NOTIFICATION_INTERVAL_MS,
    now,
    timers: deps.timers,
    run: pushUpdate,
  });

  /** Follows the chapter the notification shows: the running one, or the next in line. */
  const watch = (chapterId: string | null): void => {
    if (chapterId === watched) return;
    unwatch();
    watched = chapterId;
    latest = null;
    unwatch =
      chapterId === null
        ? () => undefined
        : progress.subscribe(chapterId, (next) => {
            latest = next;
            throttle.request();
          });
  };

  const stop = (): void => {
    generation += 1;
    throttle.cancel();
    const current = status.get();
    if (current.state === 'running') {
      status.set({ state: 'stopped', lastStartedAt: current.lastStartedAt, failure: null });
      service.stop().catch(() => undefined);
    } else if (current.state === 'starting' || current.state === 'failed') {
      // A start in flight is undone by its own completion (see `start`). A failed one is retried later.
      status.set({ state: 'stopped', lastStartedAt: current.lastStartedAt, failure: null });
    }
  };

  const start = (): void => {
    const current = status.get();
    const startedAt = now();
    const attempt = ++generation;
    status.set({ state: 'starting', lastStartedAt: current.lastStartedAt, failure: null });
    service
      .start(() => queue.idle(), notification())
      .then(
        () => {
          if (attempt !== generation) {
            service.stop().catch(() => undefined);
            return;
          }
          status.set({ state: 'running', lastStartedAt: startedAt, failure: null });
          // Progress that moved while the start was in flight is shown now, not at the next event.
          throttle.request();
        },
        (error: unknown) => {
          if (attempt !== generation) return;
          status.set({
            state: 'failed',
            lastStartedAt: status.get().lastStartedAt,
            failure: failureTextOf(error),
          });
        },
      );
  };

  /** Starts the service when work waits and the app is in the foreground, unless one is up. */
  const ensureRunning = (): void => {
    if (!app.isActive()) return;
    const state = status.get().state;
    if (state === 'starting' || state === 'running') return;
    start();
  };

  const onSnapshot = (next: QueueSnapshot): void => {
    snapshot = next;
    if (!service.supported) return;
    const working = (next.running !== null || next.pending.length > 0) && !queue.isPaused();
    if (!working) {
      watch(null);
      stop();
      return;
    }
    watch(next.running ?? next.pending[0] ?? null);
    ensureRunning();
    throttle.request();
  };

  const unsubscribeQueue = queue.subscribe(onSnapshot);
  const unsubscribeApp = app.subscribe((active) => {
    if (!active || !service.supported) return;
    const working = (snapshot.running !== null || snapshot.pending.length > 0) && !queue.isPaused();
    if (working) ensureRunning();
  });

  return {
    dispose() {
      unsubscribeQueue();
      unsubscribeApp();
      unwatch();
      watched = null;
      stop();
    },
  };
}
