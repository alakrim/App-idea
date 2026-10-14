/*
 * An ordered work pool. It runs `work` over `items` with at most `concurrency` calls in flight, and
 * hands each result to `onResult` in item order, as soon as every earlier item is done. So a slow
 * item holds back only the results after it, never the calls that can run. Cancellation stops new
 * calls. A failure stops new calls too, aborts the calls in flight and rethrows the first failure
 * once they have settled. Results that finished before the stop are still delivered, in item order,
 * gaps included: paid work is never thrown away. Pure, so it runs in Node tests and on the device.
 */
import { throwIfCancelled } from '../llm/transport';

export interface OrderedPoolOptions<R> {
  /** Calls in flight at once. A positive integer. */
  readonly concurrency: number;
  /** Stops new calls. Calls in flight receive the abort through the signal they are given. */
  readonly signal?: AbortSignal;
  /** Called once per item, in item order, and awaited before the next result is delivered. */
  readonly onResult?: (result: R, index: number) => void | Promise<void>;
}

interface Failure {
  readonly error: unknown;
}

/** Runs `work` over `items` as described above. Resolves once every result is delivered. */
export async function runOrdered<T, R>(
  items: readonly T[],
  work: (item: T, index: number, signal: AbortSignal) => Promise<R>,
  options: OrderedPoolOptions<R>,
): Promise<void> {
  const { concurrency, signal: outer, onResult } = options;
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError(`concurrency must be a positive integer, got ${concurrency}`);
  }

  const controller = new AbortController();
  const forwardAbort = (): void => controller.abort();
  if (outer?.aborted) controller.abort();
  outer?.addEventListener('abort', forwardAbort, { once: true });

  // Items are taken from one shared iterator, so each index is started by exactly one worker.
  const pending = items.entries();
  const finished = new Map<number, { readonly value: R }>();
  let nextToDeliver = 0;
  let delivery: Promise<void> = Promise.resolve();
  const state: { failure: Failure | null } = { failure: null };

  const fail = (error: unknown): void => {
    if (state.failure !== null) return;
    state.failure = { error };
    controller.abort();
  };

  // Deliveries are chained, so onResult never runs twice at once and always runs in index order.
  const deliverReady = (): Promise<void> => {
    delivery = delivery.then(async () => {
      for (;;) {
        const entry = finished.get(nextToDeliver);
        if (entry === undefined) return;
        finished.delete(nextToDeliver);
        await onResult?.(entry.value, nextToDeliver);
        nextToDeliver += 1;
      }
    });
    return delivery;
  };

  const worker = async (): Promise<void> => {
    while (state.failure === null) {
      const step = pending.next();
      if (step.done) return;
      const [index, item] = step.value;
      try {
        throwIfCancelled(outer);
        finished.set(index, { value: await work(item, index, controller.signal) });
        await deliverReady();
      } catch (error) {
        fail(error);
        return;
      }
    }
  };

  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  } finally {
    outer?.removeEventListener('abort', forwardAbort);
  }
  if (state.failure !== null) {
    // Every result still held is delivered in item order, even past a gap left by the failure.
    await delivery;
    for (const index of [...finished.keys()].sort((a, b) => a - b)) {
      const entry = finished.get(index);
      finished.delete(index);
      if (entry !== undefined) await onResult?.(entry.value, index);
    }
    throw state.failure.error;
  }
}
