import type { QueueSnapshot } from '@/core/pipeline/queue';
import type { ProcessingNotice } from '@/services/background';

import { BackgroundWork, PROBE_INTERVAL_MS } from './background-work';

import type { BackgroundWorkDeps, ProcessingServicePort } from './background-work';
import type { ChapterProgress } from './facade';
import type { AppStateStatus } from 'react-native';

const A = '01J00000000000000000000CHA';
const B = '01J00000000000000000000CHB';
const TITLE = 'The harbour';
const IDLE: QueueSnapshot = { running: null, pending: [], waiting: [] };
const RUNNING_A: QueueSnapshot = { running: A, pending: [], waiting: [] };

function progressOf(
  chapterId: string,
  overall: number,
  state: ChapterProgress['state'] = 'running',
) {
  const progress: ChapterProgress = {
    chapterId,
    state,
    stages: [
      { stage: 'analyze', status: state === 'running' ? 'running' : 'pending', progress: overall },
    ],
    overall,
    readySegments: 0,
    totalSegments: null,
    costUsdSoFar: 0,
    error: null,
    retryAt: null,
  };
  return progress;
}

interface Timer {
  readonly at: number;
  readonly run: () => void;
  cancelled: boolean;
}

/** Everything the controller touches, driven by hand. */
function harness() {
  let now = 0;
  let timers: Timer[] = [];
  let queueListener: ((snapshot: QueueSnapshot) => void) | null = null;
  let appListener: ((status: AppStateStatus) => void) | null = null;
  let cancelListener: ((chapterId: string) => void) | null = null;
  let timeoutListener: (() => void) | null = null;
  const progressListeners = new Map<string, (progress: ChapterProgress) => void>();
  let appStatus: AppStateStatus = 'active';
  let paused = false;

  const service = {
    startProcessing: jest.fn<Promise<boolean>, [ProcessingNotice]>(() => Promise.resolve(true)),
    updateProcessing: jest.fn<Promise<void>, [ProcessingNotice]>(() => Promise.resolve()),
    stopProcessing: jest.fn<Promise<void>, []>(() => Promise.resolve()),
    addCancelListener: (listener: (chapterId: string) => void) => {
      cancelListener = listener;
      return { remove: jest.fn() };
    },
    addTimeoutListener: (listener: () => void) => {
      timeoutListener = listener;
      return { remove: jest.fn() };
    },
  } satisfies ProcessingServicePort;

  const queue = {
    subscribe: (listener: (snapshot: QueueSnapshot) => void) => {
      queueListener = listener;
      return () => undefined;
    },
    isPaused: () => paused,
    retryNow: jest.fn(),
  };
  const facade = {
    subscribe: (chapterId: string, listener: (progress: ChapterProgress) => void) => {
      progressListeners.set(chapterId, listener);
      listener(progressOf(chapterId, 0.5));
      return () => progressListeners.delete(chapterId);
    },
    cancel: jest.fn(),
  };

  const deps: BackgroundWorkDeps = {
    service,
    queue,
    facade,
    appState: {
      current: () => appStatus,
      subscribe: (listener) => {
        appListener = listener;
        return () => undefined;
      },
    },
    titleOf: () => TITLE,
    scheduler: {
      after: (ms, run) => {
        const timer: Timer = { at: now + ms, run, cancelled: false };
        timers.push(timer);
        return () => {
          timer.cancelled = true;
        };
      },
    },
    now: () => now,
  };

  /** Runs due timers in order, moving the clock to each one. */
  const advance = (ms: number) => {
    const target = now + ms;
    for (;;) {
      const next = timers
        .filter((t) => !t.cancelled && t.at <= target)
        .sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      timers = timers.filter((t) => t !== next);
      now = next.at;
      next.run();
    }
    now = target;
  };

  return {
    deps,
    service,
    queue,
    facade,
    advance,
    activePendingTimers: () => timers.filter((t) => !t.cancelled).length,
    emitQueue: (snapshot: QueueSnapshot) => queueListener?.(snapshot),
    emitApp: (status: AppStateStatus) => {
      appStatus = status;
      appListener?.(status);
    },
    emitCancel: (chapterId: string) => cancelListener?.(chapterId),
    emitTimeout: () => timeoutListener?.(),
    emitProgress: (progress: ChapterProgress) =>
      progressListeners.get(progress.chapterId)?.(progress),
    setPaused: (value: boolean) => {
      paused = value;
    },
  };
}

/** Lets the resolved start promise run its callback. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('BackgroundWork', () => {
  it('starts the service when the queue gets busy, with the running chapter in the notice', async () => {
    const h = harness();
    const work = new BackgroundWork(h.deps);
    work.start();
    h.emitQueue(RUNNING_A);
    await settle();
    expect(h.service.startProcessing).toHaveBeenCalledWith({
      chapterId: A,
      title: TITLE,
      text: 'Analyzing · 50%',
      progress: 0.5,
    });
  });

  it('does not start the service in the background, and starts it on the next foreground', async () => {
    const h = harness();
    h.emitApp('background');
    const work = new BackgroundWork(h.deps);
    work.start();
    h.emitQueue(RUNNING_A);
    await settle();
    expect(h.service.startProcessing).not.toHaveBeenCalled();

    h.emitApp('active');
    await settle();
    expect(h.service.startProcessing).toHaveBeenCalledTimes(1);
    expect(h.queue.retryNow).toHaveBeenCalled();
  });

  it('updates the notification at most once a second, and always with the latest value', async () => {
    const h = harness();
    const work = new BackgroundWork(h.deps);
    work.start();
    h.emitQueue(RUNNING_A);
    await settle();

    h.advance(100);
    h.emitProgress(progressOf(A, 0.1));
    h.advance(100);
    h.emitProgress(progressOf(A, 0.2));
    h.emitProgress(progressOf(A, 0.3));
    expect(h.service.updateProcessing.mock.calls.map(([n]) => n.progress)).toEqual([0.1]);

    h.advance(1_000);
    expect(h.service.updateProcessing.mock.calls.map(([n]) => n.progress)).toEqual([0.1, 0.3]);
  });

  it('stops the service when the queue goes idle', async () => {
    const h = harness();
    const work = new BackgroundWork(h.deps);
    work.start();
    h.emitQueue(RUNNING_A);
    await settle();

    h.emitQueue(IDLE);
    expect(h.service.stopProcessing).toHaveBeenCalledTimes(1);
  });

  it('stops the service and keeps it stopped while the queue is paused', async () => {
    const h = harness();
    const work = new BackgroundWork(h.deps);
    work.start();
    h.emitQueue(RUNNING_A);
    await settle();

    h.setPaused(true);
    h.emitQueue({ running: null, pending: [A], waiting: [] });
    expect(h.service.stopProcessing).toHaveBeenCalledTimes(1);
    expect(h.service.startProcessing).toHaveBeenCalledTimes(1);
  });

  it('cancels the chapter when the notification’s Cancel action is tapped', () => {
    const h = harness();
    const work = new BackgroundWork(h.deps);
    work.start();
    h.emitCancel(A);
    expect(h.facade.cancel).toHaveBeenCalledWith(A);
  });

  it('waits for the next foreground after Android ends the time budget', async () => {
    const h = harness();
    const work = new BackgroundWork(h.deps);
    work.start();
    h.emitQueue(RUNNING_A);
    await settle();

    h.emitTimeout();
    h.emitQueue({ running: A, pending: [B], waiting: [] });
    await settle();
    expect(h.service.startProcessing).toHaveBeenCalledTimes(1);

    h.emitApp('background');
    h.emitApp('active');
    await settle();
    expect(h.service.startProcessing).toHaveBeenCalledTimes(2);
  });

  it('shows the waiting state, and retries waiting chapters every 30 s while the app is open', async () => {
    const h = harness();
    const work = new BackgroundWork(h.deps);
    work.start();
    h.emitQueue({
      running: null,
      pending: [],
      waiting: [{ chapterId: A, failures: 1, retryAt: 5_000 }],
    });
    await settle();
    h.emitProgress(progressOf(A, 0.2, 'waiting'));
    expect(h.service.updateProcessing).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Waiting for connection', progress: 0.2 }),
    );

    h.advance(PROBE_INTERVAL_MS - 1);
    expect(h.queue.retryNow).not.toHaveBeenCalled();
    h.advance(1);
    expect(h.queue.retryNow).toHaveBeenCalledTimes(1);
  });

  it('does not probe in the background', () => {
    const h = harness();
    h.emitApp('background');
    const work = new BackgroundWork(h.deps);
    work.start();
    h.emitQueue({
      running: null,
      pending: [],
      waiting: [{ chapterId: A, failures: 1, retryAt: 5_000 }],
    });
    h.advance(PROBE_INTERVAL_MS * 2);
    expect(h.queue.retryNow).not.toHaveBeenCalled();
  });

  it('cancels the probe when nothing waits any more', () => {
    const h = harness();
    const work = new BackgroundWork(h.deps);
    work.start();
    h.emitQueue({
      running: null,
      pending: [],
      waiting: [{ chapterId: A, failures: 1, retryAt: 5_000 }],
    });
    h.emitQueue(IDLE);
    expect(h.activePendingTimers()).toBe(0);
  });

  it('stops a running service when it is disposed', async () => {
    const h = harness();
    const work = new BackgroundWork(h.deps);
    const dispose = work.start();
    h.emitQueue(RUNNING_A);
    await settle();

    dispose();
    expect(h.service.stopProcessing).toHaveBeenCalledTimes(1);
  });
});
