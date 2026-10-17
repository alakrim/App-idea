/*
 * QA-F proof (P2, money). When passage 0 fails, the passages that finished behind it are never saved
 * (tts-pool.ts drain returns at the failure), so their paid audio is discarded and the retry buys
 * them again. Expected after the fix: passages 1 and 2 are saved in index order even after the gap.
 * This test fails until the saved set is allowed to have gaps, with resume reusing by input hash.
 */
import { StageFailure } from './errors';
import { AdaptiveWindow, SlidingWindow } from './tts-pool';

describe('QA-F audit: finished passages behind a failure', () => {
  it('saves passages 1 and 2 when passage 0 fails', async () => {
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
