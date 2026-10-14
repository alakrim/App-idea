import type { QueueSnapshot } from '@/core/pipeline/queue';
import type { ChapterProgress } from '@/features/pipeline/facade';

import { NOTIFICATION_INTERVAL_MS, createBackgroundRunner } from './background-runner';
import { createForegroundStatus } from './foreground-status';

import type { ForegroundNotification } from './background-notification';
import type {
  AppForegroundPort,
  BackgroundRunnerDeps,
  ForegroundServicePort,
} from './background-runner';

const A = '01J00000000000000000000CHA';
const B = '01J00000000000000000000CHB';
const IDLE: QueueSnapshot = { running: null, pending: [] };

function deferred(): { promise: Promise<void>; resolve: () => void; reject: (e: Error) => void } {
  let resolve: () => void = () => undefined;
  let reject: (e: Error) => void = () => undefined;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function progressOf(chapterId: string, overrides: Partial<ChapterProgress> = {}): ChapterProgress {
  return {
    chapterId,
    state: 'running',
    stages: [
      {
        stage: 'narrate',
        status: 'running',
        progress: 0.4,
        since: 0,
        passages: { done: 4, total: 18 },
      },
    ] as ChapterProgress['stages'],
    overall: 0.5,
    readySegments: 4,
    totalSegments: null,
    costUsdSoFar: 0,
    error: null,
    reconnecting: false,
    ...overrides,
  };
}

interface Harness {
  deps: BackgroundRunnerDeps;
  status: ReturnType<typeof createForegroundStatus>;
  setQueue: (snapshot: QueueSnapshot) => void;
  setPaused: (paused: boolean) => void;
  emitProgress: (chapterId: string, progress: ChapterProgress) => void;
  setActive: (active: boolean) => void;
  service: {
    supported: boolean;
    start: jest.Mock;
    update: jest.Mock;
    stop: jest.Mock;
    startDeferred: ReturnType<typeof deferred>[];
  };
  taskPending: () => Promise<void> | null;
  idleResolve: () => void;
  unsubscribed: () => number;
}

function harness(options: { supported?: boolean; active?: boolean } = {}): Harness {
  let snapshotListener: ((s: QueueSnapshot) => void) | null = null;
  let snapshot: QueueSnapshot = IDLE;
  let paused = false;
  const progressListeners = new Map<string, (p: ChapterProgress) => void>();
  let appListener: ((active: boolean) => void) | null = null;
  let active = options.active ?? true;
  let idleDeferred = deferred();
  let task: Promise<void> | null = null;
  let unsubscribes = 0;
  const startDeferred: ReturnType<typeof deferred>[] = [];
  const supported = options.supported ?? true;

  const service = {
    supported,
    start: jest.fn((run: () => Promise<void>) => {
      task = run();
      const gate = deferred();
      startDeferred.push(gate);
      return gate.promise;
    }),
    update: jest.fn(() => Promise.resolve()),
    stop: jest.fn(() => Promise.resolve()),
    startDeferred,
  };

  const app: AppForegroundPort = {
    isActive: () => active,
    subscribe: (listener) => {
      appListener = listener;
      return () => {
        appListener = null;
        unsubscribes += 1;
      };
    },
  };

  const deps: BackgroundRunnerDeps = {
    queue: {
      subscribe: (listener) => {
        snapshotListener = listener;
        listener(snapshot);
        return () => {
          snapshotListener = null;
          unsubscribes += 1;
        };
      },
      isPaused: () => paused,
      idle: () => idleDeferred.promise,
    },
    progress: {
      subscribe: (chapterId, listener) => {
        progressListeners.set(chapterId, listener);
        listener(progressOf(chapterId));
        return () => {
          progressListeners.delete(chapterId);
          unsubscribes += 1;
        };
      },
    },
    status: createForegroundStatus(supported),
    service: service as unknown as ForegroundServicePort,
    app,
    titleOf: (chapterId) => (chapterId === A ? 'The night harbour' : 'Second chapter'),
    now: () => Date.now(),
    timers: {
      set: (run, delayMs) => setTimeout(run, delayMs),
      clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    },
  };

  return {
    deps,
    status: deps.status as ReturnType<typeof createForegroundStatus>,
    setQueue(next) {
      snapshot = next;
      if (snapshotListener) snapshotListener(next);
    },
    setPaused(next) {
      paused = next;
    },
    emitProgress(chapterId, progress) {
      progressListeners.get(chapterId)?.(progress);
    },
    setActive(next) {
      active = next;
      appListener?.(next);
    },
    service,
    taskPending: () => task,
    idleResolve: () => {
      idleDeferred.resolve();
      idleDeferred = deferred();
    },
    unsubscribed: () => unsubscribes,
  };
}

/** Lets the platform's answer to the start settle, as it does on a device. */
async function confirmStart(h: Harness): Promise<void> {
  h.service.startDeferred[0]?.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function refuseStart(h: Harness, error: Error): Promise<void> {
  h.service.startDeferred[0]?.reject(error);
  await Promise.resolve();
  await Promise.resolve();
}

function lastNotification(h: Harness): ForegroundNotification {
  const calls = h.service.start.mock.calls as unknown[][];
  const update = h.service.update.mock.calls.at(-1) as [ForegroundNotification] | undefined;
  if (update) return update[0];
  return (calls[0]?.[1] ?? null) as ForegroundNotification;
}

describe('createBackgroundRunner', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts the service when work arrives in the foreground, with the chapter title and step', async () => {
    const h = harness();
    createBackgroundRunner(h.deps);

    h.setQueue({ running: A, pending: [] });

    expect(h.service.start).toHaveBeenCalledTimes(1);
    const first = h.service.start.mock.calls[0]?.[1] as ForegroundNotification;
    expect(first.title).toBe('The night harbour');
    expect(first.text).toBe('Narrating · passage 5 of 18');
    expect(first.progress).toEqual({ value: 4, max: 18, indeterminate: false });
    expect(h.status.get().state).toBe('starting');
  });

  it('is running once the platform confirms the start, and keeps the JS runtime alive from the start', async () => {
    const h = harness();
    createBackgroundRunner(h.deps);
    h.setQueue({ running: A, pending: [] });
    expect(h.status.keepsAlive()).toBe(true);

    await confirmStart(h);

    expect(h.status.get().state).toBe('running');
    expect(h.status.get().lastStartedAt).toBe(Date.now());
  });

  it('keeps the task pending while work runs, and lets it end when the queue is idle', async () => {
    const h = harness();
    createBackgroundRunner(h.deps);
    h.setQueue({ running: A, pending: [] });
    const task = h.taskPending();
    let ended = false;
    void task?.then(() => {
      ended = true;
    });

    await Promise.resolve();
    expect(ended).toBe(false);

    h.setQueue(IDLE);
    h.idleResolve();
    await task;
    expect(ended).toBe(true);
  });

  it('does not start when work arrives while the app is in the background', async () => {
    const h = harness({ active: false });
    createBackgroundRunner(h.deps);

    h.setQueue({ running: A, pending: [] });

    expect(h.service.start).not.toHaveBeenCalled();
    expect(h.status.get().state).toBe('stopped');
  });

  it('starts when the app returns to the foreground with work still waiting', async () => {
    const h = harness({ active: false });
    createBackgroundRunner(h.deps);
    h.setQueue({ running: A, pending: [] });

    h.setActive(true);

    expect(h.service.start).toHaveBeenCalledTimes(1);
  });

  it('stops when the queue becomes idle', async () => {
    const h = harness();
    createBackgroundRunner(h.deps);
    h.setQueue({ running: A, pending: [] });
    await confirmStart(h);

    h.setQueue(IDLE);

    expect(h.service.stop).toHaveBeenCalledTimes(1);
    expect(h.status.get().state).toBe('stopped');
    expect(h.status.keepsAlive()).toBe(false);
  });

  it('stops when the queue is paused on a missing key', async () => {
    const h = harness();
    createBackgroundRunner(h.deps);
    h.setQueue({ running: A, pending: [] });
    await confirmStart(h);

    h.setPaused(true);
    h.setQueue({ running: null, pending: [A] });

    expect(h.service.stop).toHaveBeenCalledTimes(1);
    expect(h.status.get().state).toBe('stopped');
  });

  it('keeps running while a waiting chapter is still queued after the running one finishes', async () => {
    const h = harness();
    createBackgroundRunner(h.deps);
    h.setQueue({ running: A, pending: [B] });
    await confirmStart(h);

    h.setQueue({ running: null, pending: [B] });

    expect(h.service.stop).not.toHaveBeenCalled();
    expect(h.status.get().state).toBe('running');
  });

  it('stops when the user cancels the only chapter', async () => {
    const h = harness();
    createBackgroundRunner(h.deps);
    h.setQueue({ running: A, pending: [] });
    await confirmStart(h);

    h.setQueue(IDLE);

    expect(h.service.stop).toHaveBeenCalledTimes(1);
  });

  it('updates the notification at most once every interval, and ends on the latest step', async () => {
    const h = harness();
    createBackgroundRunner(h.deps);
    h.setQueue({ running: A, pending: [] });
    await confirmStart(h);
    h.service.update.mockClear();

    for (let done = 5; done <= 9; done += 1) {
      h.emitProgress(
        A,
        progressOf(A, {
          stages: [
            {
              stage: 'narrate',
              status: 'running',
              progress: 0.5,
              since: 0,
              passages: { done, total: 18 },
            },
          ] as ChapterProgress['stages'],
        }),
      );
    }
    // The start's own run counts, so the next update waits out the interval.
    expect(h.service.update).not.toHaveBeenCalled();

    jest.advanceTimersByTime(NOTIFICATION_INTERVAL_MS);

    expect(h.service.update).toHaveBeenCalledTimes(1);
    const latest = h.service.update.mock.calls.at(-1)?.[0] as ForegroundNotification;
    expect(latest.text).toBe('Narrating · passage 10 of 18');
    expect(latest.progress.value).toBe(9);
  });

  it('shows an indeterminate bar for a step with no measure yet', async () => {
    const h = harness();
    createBackgroundRunner(h.deps);
    h.setQueue({ running: A, pending: [] });
    await confirmStart(h);
    h.service.update.mockClear();

    h.emitProgress(
      A,
      progressOf(A, {
        stages: [
          { stage: 'analyze', status: 'running', progress: 0, since: 0, passages: null },
        ] as ChapterProgress['stages'],
      }),
    );
    jest.advanceTimersByTime(NOTIFICATION_INTERVAL_MS);

    const notification = lastNotification(h);
    expect(notification.progress.indeterminate).toBe(true);
  });

  it('does not push updates while the service is not running', async () => {
    const h = harness();
    createBackgroundRunner(h.deps);
    h.setQueue({ running: A, pending: [] });
    h.emitProgress(A, progressOf(A));
    jest.advanceTimersByTime(NOTIFICATION_INTERVAL_MS * 3);

    expect(h.service.update).not.toHaveBeenCalled();
  });

  it('degrades without a crash when the platform refuses the start, and records why', async () => {
    const h = harness();
    createBackgroundRunner(h.deps);
    h.setQueue({ running: A, pending: [] });

    await refuseStart(h, new Error('Foreground service start not allowed'));

    expect(h.status.get().state).toBe('failed');
    expect(h.status.get().failure).toBe('Foreground service start not allowed');
    expect(h.status.keepsAlive()).toBe(false);
  });

  it('retries a refused start on the next change of work in the foreground', async () => {
    const h = harness();
    createBackgroundRunner(h.deps);
    h.setQueue({ running: A, pending: [] });
    await refuseStart(h, new Error('refused'));

    h.setQueue({ running: A, pending: [B] });

    expect(h.service.start).toHaveBeenCalledTimes(2);
  });

  it('undoes a start that completes after the work has already stopped', async () => {
    const h = harness();
    createBackgroundRunner(h.deps);
    h.setQueue({ running: A, pending: [] });
    h.setQueue(IDLE);

    await confirmStart(h);
    await Promise.resolve();
    await Promise.resolve();

    expect(h.service.stop).toHaveBeenCalledTimes(1);
    expect(h.status.get().state).toBe('stopped');
  });

  it('does nothing on a platform without a foreground service', async () => {
    const h = harness({ supported: false });
    createBackgroundRunner(h.deps);

    h.setQueue({ running: A, pending: [] });

    expect(h.service.start).not.toHaveBeenCalled();
    expect(h.status.get().state).toBe('unsupported');
    expect(h.status.keepsAlive()).toBe(false);
  });

  it('stops the service and detaches from the queue and the app on dispose', async () => {
    const h = harness();
    const runner = createBackgroundRunner(h.deps);
    h.setQueue({ running: A, pending: [] });
    await confirmStart(h);

    runner.dispose();

    expect(h.service.stop).toHaveBeenCalledTimes(1);
    expect(h.unsubscribed()).toBeGreaterThanOrEqual(2);
    expect(h.status.get().state).toBe('stopped');
  });
});
