/* The queue's handling of transient failures: backoff, waiting, retryNow, the cap and persistence. */

import { CHAPTER_ID, createFakePorts, ulid } from './__fixtures__/fake-ports';
import { createPipelineQueue } from './queue';
import { MAX_TRANSIENT_FAILURES, TRANSIENT_BASE_DELAY_MS } from './retry-policy';

import type { PipelineError } from '../domain';
import type { PipelineEvent } from './context';
import type { PipelinePorts } from './ports';
import type { PipelineQueue } from './queue';
import type { Scheduler } from './retry-policy';

const TEXT = 'The boats came in at dusk. Ada waited on the quay for the post.';
const T0 = 1_000_000;
const A = CHAPTER_ID;
const B = ulid(20);
const C = ulid(21);
const NETWORK: PipelineError = {
  code: 'NETWORK',
  message: 'No connection to OpenRouter.',
  retryable: true,
};
const CREDITS: PipelineError = {
  code: 'INSUFFICIENT_CREDITS',
  message: 'Add credits to keep going.',
  retryable: false,
};

/** A clock the test moves by hand. */
function manualClock(): { now: () => number; set: (ms: number) => void } {
  let current = T0;
  return { now: () => current, set: (ms) => (current = ms) };
}

/** Timers the test fires by hand, in due order. */
function manualScheduler(): Scheduler & { fireUpTo: (ms: number) => void; pending: () => number } {
  let timers: { at: number; run: () => void; cancelled: boolean }[] = [];
  let clock = T0;
  return {
    after(ms, run) {
      const timer = { at: clock + ms, run, cancelled: false };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
    fireUpTo(ms) {
      clock = ms;
      const due = timers.filter((timer) => !timer.cancelled && timer.at <= ms);
      timers = timers.filter((timer) => timer.at > ms && !timer.cancelled);
      for (const timer of due.sort((x, y) => x.at - y.at)) timer.run();
    },
    pending: () => timers.filter((timer) => !timer.cancelled).length,
  };
}

/** Fails the first `count` model calls with `error`. Every later call gets the default reply. */
function failCalls(count: number, error: PipelineError): () => undefined {
  let left = count;
  return () => {
    if (left > 0) {
      left -= 1;
      throw Object.assign(new Error(error.message), { error });
    }
    return undefined;
  };
}

async function settle(queue: PipelineQueue): Promise<void> {
  await queue.idle();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await queue.idle();
}

function setup(llm: () => undefined) {
  const fake = createFakePorts({ sourceText: TEXT, llm: () => llm() });
  fake.addChapter(B, 2, TEXT);
  fake.addChapter(C, 3, TEXT);
  const clock = manualClock();
  const scheduler = manualScheduler();
  const events: PipelineEvent[] = [];
  const ports: PipelinePorts = { ...fake.ports, clock: { now: clock.now } };
  const queue = createPipelineQueue(ports, {
    onEvent: (event) => events.push(event),
    scheduler,
    random: () => 0.5,
  });
  return { fake, clock, scheduler, events, queue, ports };
}

function doneOrder(events: PipelineEvent[]): string[] {
  return events.flatMap((e) => (e.type === 'done' ? [e.chapterId] : []));
}

describe('PipelineQueue: transient failures', () => {
  it('keeps a chapter that fails transiently, waits, and then completes it', async () => {
    const { fake, clock, scheduler, events, queue } = setup(failCalls(1, NETWORK));
    await queue.enqueue(A);
    await settle(queue);

    expect(queue.snapshot()).toEqual({
      running: null,
      pending: [],
      waiting: [{ chapterId: A, failures: 1, retryAt: T0 + TRANSIENT_BASE_DELAY_MS }],
    });
    expect(fake.chapter(A).status).toBe('failed');
    expect(events).toContainEqual({
      type: 'retrying',
      chapterId: A,
      attempt: 1,
      retryAt: T0 + TRANSIENT_BASE_DELAY_MS,
    });
    expect(doneOrder(events)).toEqual([]);

    clock.set(T0 + TRANSIENT_BASE_DELAY_MS);
    scheduler.fireUpTo(T0 + TRANSIENT_BASE_DELAY_MS);
    await settle(queue);

    expect(doneOrder(events)).toEqual([A]);
    expect(fake.chapter(A).status).toBe('ready');
    expect(queue.snapshot()).toEqual({ running: null, pending: [], waiting: [] });
  });

  it('grows the wait each time: 5 s, then 15 s', async () => {
    const { clock, scheduler, queue } = setup(failCalls(2, NETWORK));
    await queue.enqueue(A);
    await settle(queue);
    const first = queue.snapshot().waiting[0]?.retryAt;
    expect(first).toBe(T0 + 5_000);

    clock.set(T0 + 5_000);
    scheduler.fireUpTo(T0 + 5_000);
    await settle(queue);
    expect(queue.snapshot().waiting[0]).toEqual({
      chapterId: A,
      failures: 2,
      retryAt: T0 + 5_000 + 15_000,
    });
  });

  it('moves a waiting chapter behind the others, so the rest of the queue runs', async () => {
    const { events, queue } = setup(failCalls(1, NETWORK));
    await queue.enqueue(A);
    await queue.enqueue(B);
    await queue.enqueue(C);
    await settle(queue);

    expect(doneOrder(events)).toEqual([B, C]);
    expect(queue.snapshot().waiting.map((w) => w.chapterId)).toEqual([A]);
  });

  it('runs a waiting chapter at once when retryNow() is called', async () => {
    const { events, queue } = setup(failCalls(1, NETWORK));
    await queue.enqueue(A);
    await settle(queue);
    expect(queue.snapshot().waiting).toHaveLength(1);

    queue.retryNow();
    await settle(queue);

    expect(doneOrder(events)).toEqual([A]);
    expect(queue.snapshot().waiting).toEqual([]);
  });

  it('runs a waiting chapter at once when it is queued again', async () => {
    const { events, queue } = setup(failCalls(1, NETWORK));
    await queue.enqueue(A);
    await settle(queue);

    await queue.enqueue(A);
    await settle(queue);

    expect(doneOrder(events)).toEqual([A]);
  });

  it('removes a waiting chapter when it is cancelled, and never runs it', async () => {
    const { events, queue, scheduler } = setup(failCalls(1, NETWORK));
    await queue.enqueue(A);
    await settle(queue);

    await queue.cancel(A);
    scheduler.fireUpTo(T0 + 60_000);
    await settle(queue);

    expect(queue.snapshot()).toEqual({ running: null, pending: [], waiting: [] });
    expect(doneOrder(events)).toEqual([]);
  });

  it('gives up after twenty consecutive transient failures, with the last error', async () => {
    const { events, queue, scheduler, clock, fake } = setup(failCalls(1000, NETWORK));
    await queue.enqueue(A);
    await settle(queue);
    for (let failure = 1; failure < MAX_TRANSIENT_FAILURES; failure += 1) {
      const retryAt = queue.snapshot().waiting[0]?.retryAt;
      if (retryAt === undefined) throw new Error(`no retry scheduled after failure ${failure}`);
      clock.set(retryAt);
      scheduler.fireUpTo(retryAt);
      await settle(queue);
    }

    expect(queue.snapshot()).toEqual({ running: null, pending: [], waiting: [] });
    expect(events.filter((e) => e.type === 'retrying')).toHaveLength(MAX_TRANSIENT_FAILURES - 1);
    expect(fake.chapter(A).status).toBe('failed');
    const errors = events.filter((e) => e.type === 'error' && e.chapterId === A);
    expect(errors[errors.length - 1]).toMatchObject({ type: 'error', error: NETWORK });
  });

  it('leaves the queue at once for a failure that is not transient', async () => {
    const { events, queue } = setup(failCalls(1, CREDITS));
    await queue.enqueue(A);
    await queue.enqueue(B);
    await settle(queue);

    expect(queue.snapshot()).toEqual({ running: null, pending: [], waiting: [] });
    expect(doneOrder(events)).toEqual([B]);
    expect(events.some((e) => e.type === 'retrying')).toBe(false);
  });

  it('persists the waiting state, and a restarted queue resumes the chapter when it is due', async () => {
    const { fake, clock, scheduler, ports } = setup(failCalls(1, NETWORK));
    const before = createPipelineQueue(ports, {
      scheduler,
      random: () => 0.5,
    });
    await before.enqueue(A);
    await settle(before);
    expect(fake.state.queue).toEqual([
      { chapterId: A, transientFailures: 1, retryAt: T0 + TRANSIENT_BASE_DELAY_MS },
    ]);

    const events: PipelineEvent[] = [];
    const after = createPipelineQueue(ports, {
      onEvent: (event) => events.push(event),
      scheduler,
      random: () => 0.5,
    });
    await after.restore();
    expect(after.snapshot().waiting).toEqual([
      { chapterId: A, failures: 1, retryAt: T0 + TRANSIENT_BASE_DELAY_MS },
    ]);

    clock.set(T0 + TRANSIENT_BASE_DELAY_MS);
    scheduler.fireUpTo(T0 + TRANSIENT_BASE_DELAY_MS);
    await settle(after);
    expect(doneOrder(events)).toEqual([A]);
    expect(fake.state.queue).toEqual([]);
  });

  it('schedules one wake-up for a waiting chapter', async () => {
    const { scheduler, queue } = setup(failCalls(1, NETWORK));
    await queue.enqueue(A);
    await settle(queue);
    expect(scheduler.pending()).toBe(1);
  });
});
