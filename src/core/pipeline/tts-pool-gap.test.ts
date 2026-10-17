/*
 * A passage that finishes behind a failed passage is still saved, so its paid audio is kept and a retry
 * reuses it by hash (QA-F F-05). The player only ever sees the contiguous prefix; that is the caller's
 * concern, not the pool's.
 */
import { StageFailure } from './errors';
import { AdaptiveWindow, SlidingWindow } from './tts-pool';

describe('finished passages behind a failure', () => {
  it('still saves passages 1 and 2 when passage 0 fails', async () => {
    const saved: number[] = [];
    // Passage 0 fails only after passages 1 and 2 are submitted and finished, as in a real window.
    let failFirst: () => void = () => undefined;
    const mayFail = new Promise<void>((resolve) => {
      failFirst = resolve;
    });
    const pool = new SlidingWindow<number, number>({
      window: new AdaptiveWindow({ ceiling: 3 }),
      signal: new AbortController().signal,
      now: () => 0,
      wait: async () => undefined,
      work: async (item) => {
        if (item !== 0) return item;
        await mayFail;
        throw new StageFailure('UNKNOWN', 'narrator refused', { retryable: false });
      },
      save: async (item) => {
        saved.push(item);
      },
    });

    await pool.submit(0);
    await pool.submit(1);
    await pool.submit(2);
    failFirst();
    await expect(pool.finish()).rejects.toThrow('narrator refused');

    expect(saved).toEqual([1, 2]);
  });
});
