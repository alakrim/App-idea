import type { Id } from '@/core/domain';
import type { LlmReply } from '@/core/llm/transport';

import { CHAPTER_ID, createFakePorts, ulid } from './__fixtures__/fake-ports';
import { createPipelineQueue } from './queue';

import type { PipelineEvent } from './context';
import type { PipelineQueue} from './queue';

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

/** Waits until the predicate holds, yielding to the event loop between checks. */
async function until(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 1000 && !predicate(); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  if (!predicate()) throw new Error('condition never held');
}

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

  it('persists each chapter\'s run options, and a restored chapter runs from its saved stage', async () => {
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
