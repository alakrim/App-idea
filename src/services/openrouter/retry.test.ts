import { backoffDelayMs, parseRetryAfter } from './retry';

describe('backoffDelayMs', () => {
  it('grows exponentially, with jitter in the upper half of each step', () => {
    const lowest = () => 0; // jitter factor 0.5
    const highest = () => 0.999_999; // jitter factor just under 1
    expect(backoffDelayMs(0, lowest, null)).toBe(250);
    expect(backoffDelayMs(0, highest, null)).toBe(500);
    expect(backoffDelayMs(2, highest, null)).toBe(2000);
  });

  it('caps the exponential step at 8 seconds', () => {
    expect(backoffDelayMs(10, () => 0.999_999, null)).toBe(8000);
  });

  it('raises the delay to the server-requested retry-after, capped at 60 seconds', () => {
    expect(backoffDelayMs(0, () => 0, 2000)).toBe(2000);
    expect(backoffDelayMs(0, () => 0, 600_000)).toBe(60_000);
  });
});

describe('parseRetryAfter', () => {
  const now = () => Date.parse('2026-10-11T12:00:00Z');

  it('reads delta-seconds', () => {
    expect(parseRetryAfter('3', now)).toBe(3000);
  });

  it('reads an HTTP date relative to now', () => {
    expect(parseRetryAfter('Sun, 11 Oct 2026 12:00:10 GMT', now)).toBe(10_000);
  });

  it('returns null for a missing or unreadable header', () => {
    expect(parseRetryAfter(null, now)).toBeNull();
    expect(parseRetryAfter('soon', now)).toBeNull();
  });
});
