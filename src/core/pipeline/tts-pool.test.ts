import { delay } from './abort';
import {
  AdaptiveWindow,
  backoffMs,
  CONGESTION_RETRIES,
  isCongestion,
  SlidingWindow,
  WINDOW_MAX,
  WINDOW_START,
} from './tts-pool';
import { LlmCancelledError } from '../llm/transport';

import type { SegmentTiming } from './tts-pool';

/** One request the fake provider has been asked for, which the test completes by hand. */
interface PendingRequest<R> {
  readonly item: number;
  readonly signal: AbortSignal;
  resolve(value: R): void;
  reject(error: unknown): void;
}

function controlledProvider<R>(): {
  requests: PendingRequest<R>[];
  work: (item: number, signal: AbortSignal) => Promise<R>;
} {
  const requests: PendingRequest<R>[] = [];
  return {
    requests,
    // Like a real request, it rejects when its signal aborts.
    work: (item, signal) =>
      new Promise<R>((resolve, reject) => {
        signal.addEventListener('abort', () => reject(new LlmCancelledError()), { once: true });
        requests.push({ item, signal, resolve, reject });
      }),
  };
}

/** Lets pending promise callbacks run. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function rateLimited(): Error {
  return Object.assign(new Error('busy'), {
    error: { code: 'RATE_LIMITED', message: 'busy', retryable: true },
  });
}

function networkDown(): Error {
  return Object.assign(new Error('offline'), {
    error: { code: 'NETWORK', message: 'No connection.', retryable: false },
  });
}

describe('AdaptiveWindow', () => {
  it('starts at four and adds one after four straight successes, up to eight', () => {
    const window = new AdaptiveWindow();
    expect(window.limit).toBe(WINDOW_START);
    for (let i = 0; i < 4; i += 1) window.onSuccess();
    expect(window.limit).toBe(5);
    for (let i = 0; i < 4 * 10; i += 1) window.onSuccess();
    expect(window.limit).toBe(WINDOW_MAX);
  });

  it('needs four successes in a row, so a failure resets the count', () => {
    const window = new AdaptiveWindow();
    window.onSuccess();
    window.onSuccess();
    window.onSuccess();
    window.onCongestion();
    window.onSuccess();
    window.onSuccess();
    window.onSuccess();
    expect(window.limit).toBe(2);
    window.onSuccess();
    expect(window.limit).toBe(3);
  });

  it('halves on congestion and never goes below one', () => {
    const window = new AdaptiveWindow();
    window.onCongestion();
    expect(window.limit).toBe(2);
    window.onCongestion();
    expect(window.limit).toBe(1);
    window.onCongestion();
    expect(window.limit).toBe(1);
  });

  it('rounds the halving down from an odd window', () => {
    const window = new AdaptiveWindow();
    for (let i = 0; i < 4; i += 1) window.onSuccess();
    expect(window.limit).toBe(5);
    window.onCongestion();
    expect(window.limit).toBe(2);
  });

  it('is pinned to one request at a time for the free narrator, whatever happens', () => {
    const window = new AdaptiveWindow({ pinned: true });
    expect(window.limit).toBe(1);
    for (let i = 0; i < 20; i += 1) window.onSuccess();
    expect(window.limit).toBe(1);
    window.onCongestion();
    expect(window.limit).toBe(1);
  });

  it('caps the retry backoff at 30 seconds', () => {
    expect(backoffMs(1)).toBe(2_000);
    expect(backoffMs(2)).toBe(4_000);
    expect(backoffMs(10)).toBe(30_000);
  });
});

describe('isCongestion', () => {
  it('is true for a rate limit or an overload that may be retried', () => {
    expect(isCongestion(rateLimited())).toBe(true);
    expect(
      isCongestion(
        Object.assign(new Error('x'), {
          error: { code: 'UNKNOWN', message: 'trouble', retryable: true },
        }),
      ),
    ).toBe(true);
  });

  it('is false for a daily limit, a network failure and a cancellation', () => {
    expect(
      isCongestion(
        Object.assign(new Error('x'), {
          error: { code: 'RATE_LIMITED', message: 'daily', retryable: false },
        }),
      ),
    ).toBe(false);
    expect(isCongestion(networkDown())).toBe(false);
    expect(isCongestion(new LlmCancelledError())).toBe(false);
  });
});

describe('SlidingWindow: order', () => {
  it('saves in submission order even when requests finish out of order', async () => {
    const provider = controlledProvider<string>();
    const saved: number[] = [];
    const pool = new SlidingWindow<number, string>({
      window: new AdaptiveWindow(),
      signal: new AbortController().signal,
      now: () => 0,
      work: provider.work,
      save: async (item) => {
        saved.push(item);
      },
    });
    for (const item of [0, 1, 2, 3]) await pool.submit(item);

    provider.requests[3]?.resolve('three');
    provider.requests[1]?.resolve('one');
    provider.requests[2]?.resolve('two');
    await settle();
    expect(saved).toEqual([]);

    provider.requests[0]?.resolve('zero');
    await settle();
    expect(saved).toEqual([0, 1, 2, 3]);
    await pool.finish();
  });

  it('holds a finished segment in memory until its predecessor is saved', async () => {
    const provider = controlledProvider<string>();
    const saved: number[] = [];
    let releaseSave: () => void = () => undefined;
    const pool = new SlidingWindow<number, string>({
      window: new AdaptiveWindow(),
      signal: new AbortController().signal,
      now: () => 0,
      work: provider.work,
      save: (item) =>
        new Promise<void>((resolve) => {
          releaseSave = () => {
            saved.push(item);
            resolve();
          };
        }),
    });
    await pool.submit(0);
    await pool.submit(1);
    provider.requests[1]?.resolve('one');
    await settle();
    expect(saved).toEqual([]);
    provider.requests[0]?.resolve('zero');
    await settle();
    releaseSave();
    await settle();
    expect(saved).toEqual([0]);
    releaseSave();
    await pool.finish();
    expect(saved).toEqual([0, 1]);
  });

  it('keeps four requests in flight and waits for a save before starting a fifth', async () => {
    const provider = controlledProvider<string>();
    const pool = new SlidingWindow<number, string>({
      window: new AdaptiveWindow(),
      signal: new AbortController().signal,
      now: () => 0,
      work: provider.work,
      save: async () => undefined,
    });
    for (const item of [0, 1, 2, 3]) await pool.submit(item);
    let fifthStarted = false;
    const fifth = pool.submit(4).then(() => {
      fifthStarted = true;
    });
    await settle();
    expect(provider.requests).toHaveLength(4);
    expect(fifthStarted).toBe(false);

    provider.requests[0]?.resolve('zero');
    await fifth;
    expect(provider.requests).toHaveLength(5);
    for (const request of provider.requests.slice(1)) request.resolve('ok');
    await pool.finish();
  });

  it('reports the timing of each request with the window size it started in', async () => {
    const provider = controlledProvider<string>();
    let clock = 1_000;
    const timings: SegmentTiming[] = [];
    const pool = new SlidingWindow<number, string>({
      window: new AdaptiveWindow(),
      signal: new AbortController().signal,
      now: () => clock,
      work: provider.work,
      save: async (_item, _result, timing) => {
        timings.push(timing);
      },
    });
    await pool.submit(0);
    clock = 13_000;
    provider.requests[0]?.resolve('zero');
    await pool.finish();
    expect(timings).toEqual([{ synthMs: 12_000, slots: 4 }]);
  });
});

describe('SlidingWindow: adaptive congestion', () => {
  it('halves the window on a rate limit and retries the same segment after a backoff', async () => {
    const provider = controlledProvider<string>();
    const waits: number[] = [];
    const window = new AdaptiveWindow();
    const saved: number[] = [];
    const pool = new SlidingWindow<number, string>({
      window,
      signal: new AbortController().signal,
      now: () => 0,
      wait: async (ms) => {
        waits.push(ms);
      },
      work: provider.work,
      save: async (item) => {
        saved.push(item);
      },
    });
    await pool.submit(0);
    provider.requests[0]?.reject(rateLimited());
    await settle();

    expect(window.limit).toBe(2);
    expect(waits).toEqual([2_000]);
    expect(provider.requests).toHaveLength(2);
    provider.requests[1]?.resolve('again');
    await pool.finish();
    expect(saved).toEqual([0]);
  });

  it('fails the run once the retries for one segment are used up', async () => {
    const provider = controlledProvider<string>();
    const pool = new SlidingWindow<number, string>({
      window: new AdaptiveWindow(),
      signal: new AbortController().signal,
      now: () => 0,
      wait: async () => undefined,
      work: provider.work,
      save: async () => undefined,
    });
    await pool.submit(0);
    for (let attempt = 0; attempt <= CONGESTION_RETRIES; attempt += 1) {
      provider.requests[attempt]?.reject(rateLimited());
      await settle();
    }
    await expect(pool.finish()).rejects.toMatchObject({ error: { code: 'RATE_LIMITED' } });
  });

  it('keeps the free narrator to one request at a time', async () => {
    let inFlight = 0;
    let most = 0;
    const pool = new SlidingWindow<number, number>({
      window: new AdaptiveWindow({ pinned: true }),
      signal: new AbortController().signal,
      now: () => 0,
      work: async (item) => {
        inFlight += 1;
        most = Math.max(most, inFlight);
        await settle();
        inFlight -= 1;
        return item;
      },
      save: async () => undefined,
    });
    for (let item = 0; item < 5; item += 1) await pool.submit(item);
    await pool.finish();
    expect(most).toBe(1);
  });
});

describe('SlidingWindow: failure and cancellation', () => {
  it('never saves a segment behind a failure, so no orphan audio is written', async () => {
    const provider = controlledProvider<string>();
    const saved: number[] = [];
    const pool = new SlidingWindow<number, string>({
      window: new AdaptiveWindow(),
      signal: new AbortController().signal,
      now: () => 0,
      work: provider.work,
      save: async (item) => {
        saved.push(item);
      },
    });
    for (const item of [0, 1, 2, 3]) await pool.submit(item);

    provider.requests[0]?.resolve('zero');
    await settle();
    provider.requests[2]?.resolve('two');
    provider.requests[3]?.resolve('three');
    provider.requests[1]?.reject(networkDown());
    await settle();

    await expect(pool.finish()).rejects.toMatchObject({ error: { code: 'NETWORK' } });
    expect(saved).toEqual([0]);
  });

  it('aborts the requests in flight beside a failure and reports the first error', async () => {
    const provider = controlledProvider<string>();
    const pool = new SlidingWindow<number, string>({
      window: new AdaptiveWindow(),
      signal: new AbortController().signal,
      now: () => 0,
      work: provider.work,
      save: async () => undefined,
    });
    for (const item of [0, 1, 2]) await pool.submit(item);
    provider.requests[1]?.reject(networkDown());
    await settle();

    expect(provider.requests[0]?.signal.aborted).toBe(true);
    expect(provider.requests[2]?.signal.aborted).toBe(true);
    await expect(pool.finish()).rejects.toMatchObject({ error: { code: 'NETWORK' } });
  });

  it('refuses to submit after a failure', async () => {
    const provider = controlledProvider<string>();
    const pool = new SlidingWindow<number, string>({
      window: new AdaptiveWindow(),
      signal: new AbortController().signal,
      now: () => 0,
      work: provider.work,
      save: async () => undefined,
    });
    await pool.submit(0);
    provider.requests[0]?.reject(networkDown());
    await settle();
    await expect(pool.submit(1)).rejects.toMatchObject({ error: { code: 'NETWORK' } });
  });

  it('cancels every request when the run is cancelled, and saves nothing more', async () => {
    const provider = controlledProvider<string>();
    const controller = new AbortController();
    const saved: number[] = [];
    const pool = new SlidingWindow<number, string>({
      window: new AdaptiveWindow(),
      signal: controller.signal,
      now: () => 0,
      work: (item, signal) => provider.work(item, signal),
      save: async (item) => {
        saved.push(item);
      },
    });
    for (const item of [0, 1, 2]) await pool.submit(item);
    controller.abort();
    await settle();

    expect(provider.requests.every((request) => request.signal.aborted)).toBe(true);
    await expect(pool.finish()).rejects.toBeInstanceOf(LlmCancelledError);
    expect(saved).toEqual([]);
  });

  it('fails when a save fails, and stops saving after it', async () => {
    const provider = controlledProvider<string>();
    const saved: number[] = [];
    const pool = new SlidingWindow<number, string>({
      window: new AdaptiveWindow(),
      signal: new AbortController().signal,
      now: () => 0,
      work: provider.work,
      save: async (item) => {
        if (item === 0) throw new Error('disk full');
        saved.push(item);
      },
    });
    await pool.submit(0);
    await pool.submit(1);
    provider.requests[0]?.resolve('zero');
    provider.requests[1]?.resolve('one');
    await expect(pool.finish()).rejects.toThrow('disk full');
    expect(saved).toEqual([]);
  });
});

describe('delay', () => {
  it('rejects at once when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(delay(10_000, controller.signal)).rejects.toBeInstanceOf(LlmCancelledError);
  });

  it('rejects when the signal aborts while it waits', async () => {
    const controller = new AbortController();
    const waiting = delay(10_000, controller.signal);
    controller.abort();
    await expect(waiting).rejects.toBeInstanceOf(LlmCancelledError);
  });
});
