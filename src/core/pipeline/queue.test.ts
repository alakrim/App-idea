import { CHAPTER_ID, createFakePorts, ulid } from './__fixtures__/fake-ports';
import { PipelineQueue, createPipelineQueue } from './queue';

import type { PipelineEvent } from './context';
import type { Id } from '@/core/domain';
import type { LlmReply } from '@/core/llm/transport';

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
        const onAbort = (): void => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        request.signal?.addEventListener('abort', onAbort, { once: true });
        void gate.then(() => {
          request.signal?.removeEventListener('abort', onAbort);
          resolve(undefined);
        });
      });
    },
  };
}

/** Waits until the predicate holds, yielding to the event loop between checks. */
async function until(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 1000 && !predicate(); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  if (!predicate()) throw new Error('condition never held');
}

function setup(): ReturnType<typeof createFakePorts> & { events: PipelineEvent[] } {
  const fake = createFakePorts({ sourceText: TEXT });
  fake.addChapter(B, 2, TEXT);
  fake.addChapter(C, 3, TEXT);
  return { ...fake, events: [] };
}

function doneOrder(events: PipelineEvent[]): Id[] {
  return events.flatMap((e) => (e.type === 'done' ? [e.chapterId] : []));
}

describe('PipelineQueue', () => {
  it('runs chapters one at a time, in the order they were queued', async () => {
    const fake = setup();
    const queue = createPipelineQueue(fake.ports, { onEvent: (e) => fake.events.push(e) });

    await queue.enqueue(A);
    await queue.enqueue(B);
    await queue.enqueue(C);
    await queue.idle();

    expect(doneOrder(fake.events)).toEqual([A, B, C]);
    expect([A, B, C].map((id) => fake.chapter(id).status)).toEqual(['ready', 'ready', 'ready']);
    expect(queue.snapshot()).toEqual({ running: null, pending: [] });
    expect(fake.state.queue).toEqual([]);
  });

  it('does not queue a chapter twice', async () => {
    const fake = setup();
    const queue = createPipelineQueue(fake.ports);
    await queue.enqueue(A);
    await queue.enqueue(B);
    await queue.enqueue(B);
    await queue.idle();
    expect(fake.state.queue).toEqual([]);
    expect(fake.chapter(B).status).toBe('ready');
  });

  it('moves a pending chapter to the front, and the running one keeps running', async () => {
    const fake = setup();
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
    void fake;
  });

  it('removes a pending chapter when it is cancelled, and never runs it', async () => {
    const fake = setup();
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
    void fake;
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
    let calls = 0;
    const fake = createFakePorts({
      sourceText: TEXT,
      llm: (request) => {
        calls += 1;
        console.log('DBG5', calls, request.user.slice(0, 40).replace(/\n/g, ' | '), new Error().stack?.split('\n').slice(6, 22).map((l) => l.trim()).join(' <- '));
        // The first session never gets an answer, as if the app was killed mid-call.
        return calls === 1 ? new Promise<LlmReply>(() => undefined) : undefined;
      },
    });
    fake.addChapter(B, 2, TEXT);
    const before = createPipelineQueue(fake.ports);
    await before.enqueue(A);
    await before.enqueue(B);
    expect(fake.state.queue).toEqual([A, B]);

    // A new session reads the same stores.
    const events: PipelineEvent[] = [];
    const after = createPipelineQueue(fake.ports, { onEvent: (e) => events.push(e) });
    await after.restore();
    await Promise.race([after.idle(), new Promise((r) => setTimeout(r, 3000))]);
    await new Promise((r) => setTimeout(r, 50));
    console.log('DBG3', JSON.stringify(events.map((e) => [e.type, 'stage' in e ? e.stage : '', 'status' in e ? e.status : '', 'chapterId' in e ? e.chapterId.slice(-2) : '', 'error' in e ? e.error : ''])), calls, JSON.stringify(after.snapshot()));

    expect(doneOrder(events)).toEqual([A, B]);
    expect(events.find((e) => e.type === 'stage' && e.chapterId === A && e.stage === 'extract' && e.status === 'skipped')).toBeDefined();
    expect(fake.state.queue).toEqual([]);
    expect(fake.chapter(A).status).toBe('ready');
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
    const fake = setup();
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
