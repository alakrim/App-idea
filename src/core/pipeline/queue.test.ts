import type { Id } from '@/core/domain';
import type { LlmReply } from '@/core/llm/transport';

import { CHAPTER_ID, createFakePorts, mp3Bytes, ulid } from './__fixtures__/fake-ports';
import { createPipelineQueue } from './queue';
import { STALL_AFTER_MS } from './stall-watchdog';

import type { PipelineEvent } from './context';
import type { PipelineQueue } from './queue';

const TEXT = 'The boats came in at dusk. Ada waited on the quay for the post.';
const A = CHAPTER_ID;
const B = ulid(20);
const C = ulid(21);

/**
 * Holds the first model call until released. A held call rejects with an AbortError when its
 * request is aborted, as the real transport does. Every later call gets the default reply.
 */
function holdFirstCall(): {
  hold: (request: { signal?: AbortSignal }) => Promise<LlmReply | undefined> | undefined;
  release: () => void;
} {
  let open: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  let held = false;
  return {
    release: () => open(),
    hold: (request) => {
      if (held) return undefined;
      held = true;
      return new Promise<LlmReply | undefined>((resolve, reject) => {
        const onAbort = (): void =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        request.signal?.addEventListener('abort', onAbort, { once: true });
        void gate.then(() => {
          request.signal?.removeEventListener('abort', onAbort);
          resolve(undefined);
        });
      });
    },
  };
}

/** Waits until the predicate holds, letting pending work run between checks. */
async function until(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 1000 && !predicate(); i += 1) {
    await jest.advanceTimersByTimeAsync(0);
  }
  if (!predicate()) throw new Error('condition never held');
}

// Every queue runs on fake timers: a stall watchdog left armed by a test would otherwise keep the
// test run waiting for its real timer.
beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

function doneOrder(events: PipelineEvent[]): Id[] {
  return events.flatMap((e) => (e.type === 'done' ? [e.chapterId] : []));
}

describe('PipelineQueue', () => {
  it('runs chapters one at a time, in the order they were queued', async () => {
    const fake = createFakePorts({ sourceText: TEXT });
    fake.addChapter(B, 2, TEXT);
    fake.addChapter(C, 3, TEXT);
    const events: PipelineEvent[] = [];
    const queue = createPipelineQueue(fake.ports, { onEvent: (e) => events.push(e) });

    await queue.enqueue(A);
    await queue.enqueue(B);
    await queue.enqueue(C);
    await queue.idle();

    expect(doneOrder(events)).toEqual([A, B, C]);
    expect([A, B, C].map((id) => fake.chapter(id).status)).toEqual(['ready', 'ready', 'ready']);
    expect(queue.snapshot()).toEqual({ running: null, pending: [] });
    expect(fake.state.queue).toEqual([]);
  });

  it('does not queue a chapter twice', async () => {
    const fake = createFakePorts({ sourceText: TEXT });
    fake.addChapter(B, 2, TEXT);
    const queue = createPipelineQueue(fake.ports);
    await queue.enqueue(A);
    await queue.enqueue(B);
    await queue.enqueue(B);
    await queue.idle();
    expect(fake.state.queue).toEqual([]);
    expect(fake.chapter(B).status).toBe('ready');
  });

  it('moves a pending chapter to the front, and the running one keeps running', async () => {
    const gate = holdFirstCall();
    const withGate = createFakePorts({
      sourceText: TEXT,
      llm: (request) => gate.hold(request),
    });
    withGate.addChapter(B, 2, TEXT);
    withGate.addChapter(C, 3, TEXT);
    const events: PipelineEvent[] = [];
    const queue = createPipelineQueue(withGate.ports, { onEvent: (e) => events.push(e) });

    await queue.enqueue(A);
    await queue.enqueue(B);
    await queue.enqueue(C);
    expect(queue.snapshot()).toEqual({ running: A, pending: [B, C] });
    await until(() => withGate.job('analyze', A)?.status === 'running');

    await queue.moveTo(C, 0);
    expect(queue.snapshot()).toEqual({ running: A, pending: [C, B] });

    gate.release();
    await queue.idle();
    expect(doneOrder(events)).toEqual([A, C, B]);
  });

  it('removes a pending chapter when it is cancelled, and never runs it', async () => {
    const gate = holdFirstCall();
    const withGate = createFakePorts({ sourceText: TEXT, llm: (request) => gate.hold(request) });
    withGate.addChapter(B, 2, TEXT);
    withGate.addChapter(C, 3, TEXT);
    const events: PipelineEvent[] = [];
    const queue = createPipelineQueue(withGate.ports, { onEvent: (e) => events.push(e) });

    await queue.enqueue(A);
    await queue.enqueue(B);
    await queue.enqueue(C);
    await until(() => withGate.job('analyze', A)?.status === 'running');
    await queue.cancel(C);
    expect(queue.snapshot()).toEqual({ running: A, pending: [B] });

    gate.release();
    await queue.idle();
    expect(doneOrder(events)).toEqual([A, B]);
    expect(withGate.chapter(C).status).toBe('draft');
    expect(withGate.job('extract', C)).toBeUndefined();
  });

  it('aborts the running chapter when it is cancelled, and moves on to the next one', async () => {
    const gate = holdFirstCall();
    const fake = createFakePorts({ sourceText: TEXT, llm: (request) => gate.hold(request) });
    fake.addChapter(B, 2, TEXT);
    const events: PipelineEvent[] = [];
    const queue = createPipelineQueue(fake.ports, { onEvent: (e) => events.push(e) });

    await queue.enqueue(A);
    await queue.enqueue(B);
    await until(() => fake.job('analyze', A)?.status === 'running');

    await queue.cancel(A);
    await queue.idle();

    expect(fake.chapter(A).status).toBe('draft');
    expect(fake.job('analyze', A)?.status).toBe('cancelled');
    expect(doneOrder(events)).toEqual([B]);
    expect(events.some((e) => e.type === 'error' && e.error.code === 'CANCELLED')).toBe(true);
    gate.release();
  });

  it('restores the persisted queue after a restart and resumes the interrupted chapter', async () => {
    // While `dying` is set, every model call hangs, as if the app was killed mid-call.
    let dying = true;
    const fake = createFakePorts({
      sourceText: TEXT,
      llm: () => (dying ? new Promise<LlmReply>(() => undefined) : undefined),
    });
    fake.addChapter(B, 2, TEXT);
    const before = createPipelineQueue(fake.ports);
    await before.enqueue(A);
    await before.enqueue(B);
    expect(fake.state.queue.map((item) => item.chapterId)).toEqual([A, B]);
    await until(() => fake.job('analyze', A)?.status === 'running');

    // The new session reads the same stores once the old one is gone.
    dying = false;
    const events: PipelineEvent[] = [];
    const after = createPipelineQueue(fake.ports, { onEvent: (e) => events.push(e) });
    await after.restore();
    await after.idle();

    expect(doneOrder(events)).toEqual([A, B]);
    expect(
      events.some(
        (e) =>
          e.type === 'stage' &&
          e.chapterId === A &&
          e.stage === 'extract' &&
          e.status === 'skipped',
      ),
    ).toBe(true);
    expect(fake.state.queue).toEqual([]);
    expect(fake.chapter(A).status).toBe('ready');
  });

  it("persists each chapter's run options, and a restored chapter runs from its saved stage", async () => {
    let dying = true;
    const fake = createFakePorts({
      sourceText: TEXT,
      llm: () => (dying ? new Promise<LlmReply>(() => undefined) : undefined),
    });
    fake.addChapter(B, 2, TEXT);
    const before = createPipelineQueue(fake.ports);
    await before.enqueue(A);
    await before.enqueue(B, { from: 'narrate', force: true, pdfEngine: 'mistral-ocr' });
    expect(fake.state.queue).toEqual([
      { chapterId: A },
      { chapterId: B, from: 'narrate', force: true, pdfEngine: 'mistral-ocr' },
    ]);
    await until(() => fake.job('analyze', A)?.status === 'running');

    dying = false;
    const events: PipelineEvent[] = [];
    const after = createPipelineQueue(fake.ports, { onEvent: (e) => events.push(e) });
    await after.restore();
    await after.idle();

    const bStages = events.flatMap((e) =>
      e.type === 'stage' && e.chapterId === B ? [e.stage] : [],
    );
    expect(bStages[0]).toBe('narrate');
    expect(bStages).not.toContain('extract');
  });

  it('pauses on an AUTH failure, keeps the queue, and runs it again after resume()', async () => {
    let keyMissing = true;
    const authError = Object.assign(new Error('no key'), {
      error: { code: 'AUTH', message: 'Add your OpenRouter key.', retryable: false },
    });
    const fake = createFakePorts({
      sourceText: TEXT,
      llm: () => {
        if (keyMissing) throw authError;
        return undefined;
      },
    });
    fake.addChapter(B, 2, TEXT);
    const queue = createPipelineQueue(fake.ports);
    await queue.enqueue(A);
    await queue.enqueue(B);
    await queue.idle();

    expect(queue.isPaused()).toBe(true);
    expect(queue.snapshot()).toEqual({ running: null, pending: [A, B] });
    expect(fake.chapter(A).status).toBe('failed');
    expect(fake.chapter(B).status).toBe('draft');
    expect(fake.state.queue.map((item) => item.chapterId)).toEqual([A, B]);

    keyMissing = false;
    queue.resume();
    await queue.idle();

    expect(queue.isPaused()).toBe(false);
    expect([A, B].map((id) => fake.chapter(id).status)).toEqual(['ready', 'ready']);
    expect(fake.state.queue).toEqual([]);
  });

  it('keeps a failure in its own chapter, so the chapters after it still run', async () => {
    const fake = createFakePorts({ sourceText: TEXT });
    fake.addChapter(B, 2, '');
    const events: PipelineEvent[] = [];
    const queue = createPipelineQueue(fake.ports, { onEvent: (e) => events.push(e) });
    await queue.enqueue(B);
    await queue.enqueue(A);
    await queue.idle();
    expect(fake.chapter(B).status).toBe('failed');
    expect(doneOrder(events)).toEqual([A]);
  });

  it('notifies subscribers with the current snapshot, and stops after unsubscribe', async () => {
    const fake = createFakePorts({ sourceText: TEXT });
    fake.addChapter(B, 2, TEXT);
    const queue: PipelineQueue = createPipelineQueue(fake.ports);
    const seen: string[] = [];
    const unsubscribe = queue.subscribe((snapshot) => seen.push(snapshot.running ?? '-'));
    await queue.enqueue(A);
    await queue.idle();
    unsubscribe();
    const count = seen.length;
    await queue.enqueue(B);
    await queue.idle();
    expect(seen[0]).toBe('-');
    expect(seen).toContain(A);
    expect(seen).toHaveLength(count);
  });
});

/** A long chapter with many narration passages, so a stall can hit one passage of several. */
const LONG_TEXT = Array.from(
  { length: 60 },
  (_, n) => `Sentence ${n} tells of the quay, the lamps and the slow turn of the tide.`,
).join(' ');

/** Real time for the queue's clock, so the stall watchdog reads the fake timers' time. */
const WALL_CLOCK = { now: () => Date.now() };
const SPEECH_TIMEOUT_MS = 180_000;

/** Rejects when the signal aborts, as a stage's call does. It never resolves otherwise. */
function abortedAt(signal: AbortSignal): Promise<never> {
  return new Promise<never>((_resolve, reject) => {
    signal.addEventListener(
      'abort',
      () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
      { once: true },
    );
  });
}

function networkEvents(events: PipelineEvent[]): PipelineEvent[] {
  return events.filter(
    (e) => e.type === 'stall' || e.type === 'staleAbort' || e.type === 'reconnecting',
  );
}

describe('PipelineQueue: stalls and the network', () => {
  it('retires the requests in flight on a stall, and the stalled passage then completes', async () => {
    let retired: () => void = () => undefined;
    const retirement = new Promise<void>((resolve) => {
      retired = resolve;
    });
    let first = true;
    const events: PipelineEvent[] = [];
    const fake = createFakePorts({
      sourceText: LONG_TEXT,
      onRetire: () => retired(),
      tts: async (_text, _profile, signal) => {
        if (first) {
          first = false;
          await Promise.race([retirement, abortedAt(signal)]);
        }
        return { bytes: mp3Bytes(4), mime: 'audio/mpeg', costUsd: null, generationId: null };
      },
    });
    const queue = createPipelineQueue(fake.ports, {
      onEvent: (e) => events.push(e),
      clock: WALL_CLOCK,
    });

    await queue.enqueue(A);
    await jest.advanceTimersByTimeAsync(STALL_AFTER_MS);
    await queue.idle();

    expect(fake.network.retireCalls).toBe(1);
    expect(events).toContainEqual({ type: 'stall', chapterId: A, stage: 'narrate', count: 1 });
    expect(doneOrder(events)).toEqual([A]);
  });

  it('fails the chapter after three stalls, keeps the passages already saved, and a retry resumes there', async () => {
    let stuck = true;
    const events: PipelineEvent[] = [];
    const fake = createFakePorts({
      sourceText: LONG_TEXT,
      tts: async (_text, _profile, signal) => {
        if (stuck && fake.state.ttsCalls.length > 1) await abortedAt(signal);
        return { bytes: mp3Bytes(4), mime: 'audio/mpeg', costUsd: null, generationId: null };
      },
    });
    const queue = createPipelineQueue(fake.ports, {
      onEvent: (e) => events.push(e),
      clock: WALL_CLOCK,
    });

    await queue.enqueue(A);
    await jest.advanceTimersByTimeAsync(3 * STALL_AFTER_MS + 1_000);
    await queue.idle();

    const stalls = events.filter((e) => e.type === 'stall');
    expect(stalls.map((e) => (e.type === 'stall' ? e.count : 0))).toEqual([1, 2, 3]);
    expect(fake.network.retireCalls).toBe(2);
    expect(fake.chapter().status).toBe('failed');
    const failure = events.find((e) => e.type === 'error' && e.stage === 'narrate');
    expect(failure).toEqual({
      type: 'error',
      chapterId: A,
      stage: 'narrate',
      error: {
        code: 'NETWORK',
        message:
          'Lectio lost its connection while preparing this chapter. Tap Retry to continue where it stopped.',
        retryable: true,
      },
    });
    const saved = fake.state.segments.get(A) ?? [];
    expect(saved.length).toBeGreaterThan(0);

    stuck = false;
    const callsBefore = fake.state.ttsCalls.length;
    await queue.enqueue(A, { from: 'narrate' });
    await queue.idle();

    expect(fake.chapter().status).toBe('ready');
    const retried = fake.state.ttsCalls.length - callsBefore;
    expect(retried).toBeGreaterThan(0);
    // Passages already saved are not spoken again: the retry speaks only the rest.
    expect(fake.state.segments.get(A)?.length).toBe(saved.length + retried);
  });

  it('counts nothing while the app is in the background, and reports reconnecting on return', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const events: PipelineEvent[] = [];
    const fake = createFakePorts({
      sourceText: LONG_TEXT,
      tts: async () => {
        await gate;
        return { bytes: mp3Bytes(4), mime: 'audio/mpeg', costUsd: null, generationId: null };
      },
    });
    const queue = createPipelineQueue(fake.ports, {
      onEvent: (e) => events.push(e),
      clock: WALL_CLOCK,
    });

    await queue.enqueue(A);
    await jest.advanceTimersByTimeAsync(1_000);
    fake.network.emit({ type: 'backgrounded' });
    await jest.advanceTimersByTimeAsync(10 * 60_000);
    expect(networkEvents(events)).toEqual([]);

    fake.network.emit({ type: 'resumed' });
    expect(events).toContainEqual({ type: 'reconnecting', chapterId: A });
    // Watching resumes on return: a silent chapter still stalls one quiet period later.
    await jest.advanceTimersByTimeAsync(STALL_AFTER_MS);
    expect(events.filter((e) => e.type === 'stall')).toHaveLength(1);
    release();
    await queue.idle();
    expect(doneOrder(events)).toEqual([A]);
  });

  it('keeps watching in the background while a foreground service keeps JS alive', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const events: PipelineEvent[] = [];
    const fake = createFakePorts({
      sourceText: LONG_TEXT,
      tts: async () => {
        await gate;
        return { bytes: mp3Bytes(4), mime: 'audio/mpeg', costUsd: null, generationId: null };
      },
    });
    const queue = createPipelineQueue(fake.ports, {
      onEvent: (e) => events.push(e),
      clock: WALL_CLOCK,
      keepsAliveInBackground: () => true,
    });

    await queue.enqueue(A);
    await jest.advanceTimersByTimeAsync(1_000);
    fake.network.emit({ type: 'backgrounded' });
    await jest.advanceTimersByTimeAsync(STALL_AFTER_MS);
    expect(events.filter((e) => e.type === 'stall')).toHaveLength(1);
    release();
    await queue.idle();
    expect(doneOrder(events)).toEqual([A]);
  });

  it('lets a request that reports its timeout keep the chapter quiet for that long too', async () => {
    const gate = new Promise<void>(() => undefined);
    const events: PipelineEvent[] = [];
    const fake = createFakePorts({
      sourceText: LONG_TEXT,
      tts: () => gate.then(() => ({ bytes: mp3Bytes(1), mime: 'audio/mpeg', costUsd: null, generationId: null })),
    });
    const queue = createPipelineQueue(fake.ports, {
      onEvent: (e) => events.push(e),
      clock: WALL_CLOCK,
    });

    await queue.enqueue(A);
    await jest.advanceTimersByTimeAsync(1_000);
    fake.network.emit({ type: 'attempt', timeoutMs: SPEECH_TIMEOUT_MS });
    await jest.advanceTimersByTimeAsync(STALL_AFTER_MS + SPEECH_TIMEOUT_MS - 1_000);
    expect(events.filter((e) => e.type === 'stall')).toEqual([]);

    await jest.advanceTimersByTimeAsync(1_000);
    expect(events.filter((e) => e.type === 'stall')).toHaveLength(1);
  });

  it('attributes a stale retry to the running chapter, and drops it when nothing runs', async () => {
    const events: PipelineEvent[] = [];
    const fake = createFakePorts({ sourceText: TEXT });
    const queue = createPipelineQueue(fake.ports, {
      onEvent: (e) => events.push(e),
      clock: WALL_CLOCK,
    });

    fake.network.emit({ type: 'staleAbort' });
    expect(events.filter((e) => e.type === 'staleAbort')).toEqual([]);

    await queue.enqueue(A);
    await queue.idle();
    fake.network.emit({ type: 'staleAbort' });
    expect(events.filter((e) => e.type === 'staleAbort')).toEqual([]);
  });

  it('keeps the queue when saving fails, reports the failure once, and saves again on the next change', async () => {
    const fake = createFakePorts({ sourceText: TEXT });
    let failing = true;
    const saved: string[][] = [];
    fake.ports.jobs.saveQueue = async (items) => {
      if (failing) throw new Error('disk is full');
      saved.push(items.map((item) => item.chapterId));
    };
    const failures: number[] = [];
    const queue = createPipelineQueue(fake.ports, { onSaveFailed: () => failures.push(1) });

    await queue.enqueue(CHAPTER_ID);
    await queue.enqueue(ulid(9));

    expect(queue.snapshot().pending.length + (queue.snapshot().running ? 1 : 0)).toBeGreaterThan(0);
    expect(failures).toEqual([1]);

    failing = false;
    await queue.enqueue(ulid(10));
    expect(failures).toEqual([1]);
    expect(saved.at(-1)).toContain(ulid(10));
  });
});
