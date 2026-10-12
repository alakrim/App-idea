import { runOrdered } from './ordered-pool';

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** A promise that the test settles by hand, so the order of completion is exact. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (e: unknown) => void } {
  let resolve: (value: T) => void = () => undefined;
  let reject: (e: unknown) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('runOrdered', () => {
  it('delivers results in item order, even when later items finish first', async () => {
    const gates = [deferred<string>(), deferred<string>(), deferred<string>()];
    const delivered: string[] = [];
    const run = runOrdered(
      [0, 1, 2],
      (_item, index) => gates[index]?.promise ?? Promise.reject(new Error('no gate')),
      {
        concurrency: 3,
        onResult: (result) => {
          delivered.push(result);
        },
      },
    );

    gates[2]?.resolve('two');
    gates[1]?.resolve('one');
    await wait(5);
    expect(delivered).toEqual([]);
    gates[0]?.resolve('zero');
    await run;

    expect(delivered).toEqual(['zero', 'one', 'two']);
  });

  it('keeps at most `concurrency` calls in flight, and starts a new one as soon as a slot frees', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const started: number[] = [];
    const delays = [30, 5, 5, 5, 5, 5];

    await runOrdered(
      delays,
      async (delay, index) => {
        started.push(index);
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await wait(delay);
        inFlight -= 1;
        return index;
      },
      { concurrency: 3 },
    );

    expect(maxInFlight).toBe(3);
    // Item 3 starts while item 0 is still running, so the slow item holds back only its results.
    expect(started.slice(0, 4)).toEqual([0, 1, 2, 3]);
  });

  it('runs one onResult at a time, in order', async () => {
    let inDelivery = 0;
    let maxInDelivery = 0;
    const order: number[] = [];

    await runOrdered(
      [0, 1, 2, 3, 4],
      async (_item, index) => {
        await wait(5 - index);
        return index;
      },
      {
        concurrency: 3,
        onResult: async (result) => {
          inDelivery += 1;
          maxInDelivery = Math.max(maxInDelivery, inDelivery);
          await wait(2);
          order.push(result);
          inDelivery -= 1;
        },
      },
    );

    expect(maxInDelivery).toBe(1);
    expect(order).toEqual([0, 1, 2, 3, 4]);
  });

  it('resolves at once for no items, and rejects a concurrency below one', async () => {
    const work = jest.fn(async () => 1);
    await expect(runOrdered([], work, { concurrency: 3 })).resolves.toBeUndefined();
    expect(work).not.toHaveBeenCalled();
    await expect(runOrdered([1], work, { concurrency: 0 })).rejects.toThrow(RangeError);
    await expect(runOrdered([1], work, { concurrency: 1.5 })).rejects.toThrow(RangeError);
  });

  it('stops starting new calls once the signal is aborted, and rejects with the cancellation', async () => {
    const controller = new AbortController();
    const started: number[] = [];

    const outcome = runOrdered(
      [0, 1, 2, 3, 4],
      async (_item, index) => {
        started.push(index);
        if (index === 1) controller.abort();
        return index;
      },
      { concurrency: 1, signal: controller.signal },
    ).catch((error: unknown) => error);

    const error = await outcome;
    expect(error).toMatchObject({ code: 'CANCELLED' });
    expect(started).toEqual([0, 1]);
  });

  it('aborts the calls in flight after a failure, and rethrows the first failure once they settle', async () => {
    const sawAbort: boolean[] = [];
    const started: number[] = [];
    const delivered: number[] = [];

    const error = await runOrdered(
      [0, 1, 2],
      (_item, index, signal) => {
        started.push(index);
        if (index === 1) return Promise.reject(new Error('the first failure'));
        // Item 0 is still in flight when item 1 fails, so it must be aborted.
        return new Promise<number>((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            sawAbort.push(true);
            reject(new Error('aborted by the pool'));
          });
        });
      },
      {
        concurrency: 2,
        onResult: (result) => {
          delivered.push(result);
        },
      },
    ).catch((caught: unknown) => caught);

    expect(error).toEqual(new Error('the first failure'));
    expect(started).toEqual([0, 1]);
    expect(sawAbort).toEqual([true]);
    expect(delivered).toEqual([]);
  });

  it('delivers the results before a failure in order, and nothing after it', async () => {
    const delivered: number[] = [];
    await expect(
      runOrdered(
        [0, 1, 2, 3],
        async (_item, index) => {
          if (index === 2) throw new Error('boom');
          return index;
        },
        {
          concurrency: 1,
          onResult: (result) => {
            delivered.push(result);
          },
        },
      ),
    ).rejects.toThrow('boom');
    expect(delivered).toEqual([0, 1]);
  });
});
