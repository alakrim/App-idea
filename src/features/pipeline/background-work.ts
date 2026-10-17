/*
 * Keeps the processing service in step with the pipeline (brief BG1, ADR-0007):
 *  - starts the service when the queue gets busy, while the app is in the foreground
 *  - feeds the notification its chapter's progress, at most once a second
 *  - stops the service when the queue is idle or paused
 *  - cancels a chapter from the notification's Cancel action
 *  - when Android ends the service's time budget, waits for the next foreground
 *  - retries waiting chapters when the app comes to the foreground, and every 30 s while it is open
 *  - records the service's state, so the queue keeps counting stalls while the service runs
 *
 * Every platform touch goes through the ports, so the rules are unit-tested without a device.
 */
import type { QueueSnapshot } from '@/core/pipeline/queue';
import type { Scheduler } from '@/core/pipeline/retry-policy';
import type { ProcessingNotice } from '@/services/background';
import type {
  ForegroundServiceState,
  ForegroundStatusStore,
} from '@/services/pipeline/foreground-status';

import { createThrottle, NOTICE_INTERVAL_MS, noticeOf } from './processing-notice';

import type { ChapterProgress } from './facade';
import type { Throttle } from './processing-notice';
import type { AppStateStatus } from 'react-native';

/** While chapters wait for a connection, the open app retries them this often. */
export const PROBE_INTERVAL_MS = 30_000;

export interface Subscription {
  remove(): void;
}

/** The native processing service, as the controller uses it (see modules/lectio-background). */
export interface ProcessingServicePort {
  startProcessing(notice: ProcessingNotice): Promise<boolean>;
  updateProcessing(notice: ProcessingNotice): Promise<void>;
  stopProcessing(): Promise<void>;
  addCancelListener(listener: (chapterId: string) => void): Subscription;
  addTimeoutListener(listener: () => void): Subscription;
}

export interface BackgroundWorkDeps {
  readonly service: ProcessingServicePort;
  readonly queue: {
    subscribe(listener: (snapshot: QueueSnapshot) => void): () => void;
    isPaused(): boolean;
    retryNow(): void;
  };
  readonly facade: {
    subscribe(chapterId: string, listener: (progress: ChapterProgress) => void): () => void;
    cancel(chapterId: string): void;
  };
  readonly appState: {
    current(): AppStateStatus;
    subscribe(listener: (status: AppStateStatus) => void): () => void;
  };
  /** The chapter title the notification shows. */
  titleOf(chapterId: string): string;
  /** Where the service's state is written, so the queue's watchdog knows it keeps running. */
  readonly foreground: Pick<ForegroundStatusStore, 'get' | 'set'>;
  readonly scheduler: Scheduler;
  readonly now: () => number;
}

const EMPTY_QUEUE: QueueSnapshot = { running: null, pending: [], waiting: [] };

/** True while the queue has work the service should keep alive. A queue paused on a key is not busy. */
export function isQueueBusy(snapshot: QueueSnapshot, paused: boolean): boolean {
  if (paused) return false;
  const { running, pending, waiting } = snapshot;
  return running !== null || pending.length > 0 || waiting.length > 0;
}

/** The chapter the notification is about: the running one, else the first waiting or queued one. */
function focusOf(snapshot: QueueSnapshot): string | null {
  return snapshot.running ?? snapshot.waiting[0]?.chapterId ?? snapshot.pending[0] ?? null;
}

export class BackgroundWork {
  private queue: QueueSnapshot = EMPTY_QUEUE;
  private focus: string | null = null;
  private unfocus: (() => void) | null = null;
  private latest: ProcessingNotice | null = null;
  private serviceRunning = false;
  private starting = false;
  /** Android ended the service's time budget. It starts again on the next foreground. */
  private timedOut = false;
  private probe: (() => void) | null = null;
  private disposed = false;
  private readonly throttle: Throttle<ProcessingNotice>;

  constructor(private readonly deps: BackgroundWorkDeps) {
    this.throttle = createThrottle<ProcessingNotice>({
      intervalMs: NOTICE_INTERVAL_MS,
      now: deps.now,
      schedule: (ms, run) => deps.scheduler.after(ms, run),
      send: (notice) => {
        void deps.service.updateProcessing(notice);
      },
    });
  }

  /** Connects to the queue, the app state and the service's events. Returns the disposer. */
  start(): () => void {
    const cancelSubscription = this.deps.service.addCancelListener((chapterId) =>
      this.deps.facade.cancel(chapterId),
    );
    const timeoutSubscription = this.deps.service.addTimeoutListener(() => this.onTimeout());
    const disposers: (() => void)[] = [
      this.deps.queue.subscribe((snapshot) => this.onQueue(snapshot)),
      this.deps.appState.subscribe((status) => this.onAppState(status)),
      () => cancelSubscription.remove(),
      () => timeoutSubscription.remove(),
    ];
    return () => {
      if (this.disposed) return;
      this.disposed = true;
      for (const dispose of disposers) dispose();
      this.unfocus?.();
      this.throttle.cancel();
      this.probe?.();
      this.probe = null;
      if (this.serviceRunning) void this.deps.service.stopProcessing();
      this.serviceRunning = false;
      this.setState('stopped');
    };
  }

  private onQueue(snapshot: QueueSnapshot): void {
    this.queue = snapshot;
    this.refocus(focusOf(snapshot));
    this.reconcile();
    this.syncProbe();
  }

  private onAppState(status: AppStateStatus): void {
    if (status === 'active') {
      this.timedOut = false;
      this.deps.queue.retryNow();
      this.reconcile();
    }
    this.syncProbe();
  }

  private onTimeout(): void {
    this.serviceRunning = false;
    this.timedOut = true;
    this.throttle.cancel();
    this.setState('stopped');
  }

  /** Records the service's state for the pipeline. Nothing is recorded where there is no service. */
  private setState(state: ForegroundServiceState): void {
    if (this.deps.foreground.get() === 'unsupported') return;
    this.deps.foreground.set(state);
  }

  private isForeground(): boolean {
    return this.deps.appState.current() === 'active';
  }

  private isBusy(): boolean {
    return isQueueBusy(this.queue, this.deps.queue.isPaused());
  }

  /** Starts or stops the service so that it runs exactly while the queue is busy. */
  private reconcile(): void {
    if (this.isBusy()) {
      if (!this.serviceRunning) this.startService();
      else if (this.latest) this.throttle.push(this.latest);
    } else if (this.serviceRunning) {
      this.stopService();
    }
  }

  private startService(): void {
    if (this.starting || this.timedOut || !this.isForeground()) return;
    this.starting = true;
    this.setState('starting');
    void this.deps.service.startProcessing(this.currentNotice()).then(
      (started) => {
        this.starting = false;
        if (this.disposed) {
          if (started) void this.deps.service.stopProcessing();
          return;
        }
        this.serviceRunning = started;
        this.setState(started ? 'running' : 'stopped');
        if (started && !this.isBusy()) this.stopService();
      },
      () => {
        this.starting = false;
        this.setState('stopped');
      },
    );
  }

  private stopService(): void {
    this.serviceRunning = false;
    this.throttle.cancel();
    this.setState('stopped');
    void this.deps.service.stopProcessing();
  }

  /** Points the notification at a new chapter, and follows that chapter's progress. */
  private refocus(chapterId: string | null): void {
    if (chapterId === this.focus) return;
    this.unfocus?.();
    this.unfocus = null;
    this.focus = chapterId;
    this.latest = null;
    if (chapterId !== null) {
      this.unfocus = this.deps.facade.subscribe(chapterId, (progress) => this.onProgress(progress));
    }
  }

  private onProgress(progress: ChapterProgress): void {
    this.latest = noticeOf(progress, this.deps.titleOf(progress.chapterId));
    if (this.serviceRunning) this.throttle.push(this.latest);
  }

  private currentNotice(): ProcessingNotice {
    if (this.latest) return this.latest;
    const chapterId = this.focus ?? '';
    return { chapterId, title: this.deps.titleOf(chapterId), text: 'Queued', progress: 0 };
  }

  /** While a chapter waits and the app is open, retries it every 30 s. Stops when nothing waits. */
  private syncProbe(): void {
    const wanted =
      this.queue.waiting.length > 0 && this.isForeground() && !this.deps.queue.isPaused();
    if (wanted && this.probe === null) {
      const cancel = this.deps.scheduler.after(PROBE_INTERVAL_MS, () => {
        this.probe = null;
        this.deps.queue.retryNow();
      });
      this.probe = cancel;
    } else if (!wanted && this.probe !== null) {
      this.probe();
      this.probe = null;
    }
  }
}
