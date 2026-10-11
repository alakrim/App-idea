import { isDailyLimit } from './rate-limit';

const NOW = Date.parse('2026-10-11T12:00:00Z');

function headers(map: Record<string, string>) {
  return { get: (name: string) => map[name.toLowerCase()] ?? null };
}

describe('isDailyLimit', () => {
  it('reads the daily window from the error text', () => {
    const body = JSON.stringify({
      error: { message: 'Rate limit exceeded: free-models-per-day', code: 429 },
    });
    expect(isDailyLimit(body, headers({}), NOW)).toBe(true);
    expect(isDailyLimit('You have hit your limit per day', headers({}), NOW)).toBe(true);
  });

  it('reads a window that resets hours away from the X-RateLimit headers', () => {
    const reset = String(NOW + 6 * 60 * 60 * 1000);
    expect(
      isDailyLimit(
        '{}',
        headers({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': reset }),
        NOW,
      ),
    ).toBe(true);
  });

  it('does not call a per-minute window daily, even when it is exhausted', () => {
    const reset = String(NOW + 5_000);
    expect(
      isDailyLimit(
        '{}',
        headers({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': reset }),
        NOW,
      ),
    ).toBe(false);
  });

  it('ignores headers that still have allowance, and missing or malformed headers', () => {
    const reset = String(NOW + 6 * 60 * 60 * 1000);
    expect(
      isDailyLimit(
        '{}',
        headers({ 'x-ratelimit-remaining': '3', 'x-ratelimit-reset': reset }),
        NOW,
      ),
    ).toBe(false);
    expect(isDailyLimit('{}', headers({}), NOW)).toBe(false);
    expect(
      isDailyLimit(
        '{}',
        headers({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': 'soon' }),
        NOW,
      ),
    ).toBe(false);
  });
});
