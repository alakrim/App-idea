import {
  TRANSIENT_BASE_DELAY_MS,
  TRANSIENT_MAX_DELAY_MS,
  isTransient,
  transientRetryDelayMs,
} from './retry-policy';

import type { PipelineError } from '../domain';

const midpoint = () => 0.5;

describe('transientRetryDelayMs', () => {
  it('grows 5 s, 15 s, 45 s with no jitter at the midpoint', () => {
    expect([0, 1, 2].map((attempt) => transientRetryDelayMs(attempt, midpoint))).toEqual([
      5_000, 15_000, 45_000,
    ]);
  });

  it('caps the base delay at 5 minutes', () => {
    expect(transientRetryDelayMs(10, midpoint)).toBe(TRANSIENT_MAX_DELAY_MS);
    expect(transientRetryDelayMs(500, midpoint)).toBe(TRANSIENT_MAX_DELAY_MS);
  });

  it('spreads each delay by at most 20 percent either way', () => {
    const low = transientRetryDelayMs(1, () => 0);
    const high = transientRetryDelayMs(1, () => 0.999_999);
    expect(low).toBe(Math.round(15_000 * 0.8));
    expect(high).toBe(Math.round(15_000 * 1.2));
  });

  it('never exceeds the cap, even with the largest jitter', () => {
    expect(transientRetryDelayMs(9, () => 0.999_999)).toBeLessThanOrEqual(TRANSIENT_MAX_DELAY_MS);
  });

  it('treats a negative attempt as the first one', () => {
    expect(transientRetryDelayMs(-3, midpoint)).toBe(TRANSIENT_BASE_DELAY_MS);
  });
});

describe('isTransient', () => {
  const error = (retryable: boolean): PipelineError => ({
    code: 'NETWORK',
    message: 'No connection.',
    retryable,
  });

  it('follows the retryable flag of the error', () => {
    expect(isTransient(error(true))).toBe(true);
    expect(isTransient(error(false))).toBe(false);
  });
});
