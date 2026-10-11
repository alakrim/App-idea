import { failureFromHttp } from './error-mapping';

const body = (limitSource: string, message = 'Budget exceeded'): string =>
  JSON.stringify({ error: { message, metadata: { limit_source: limitSource } } });

describe('failureFromHttp 402 handling', () => {
  it('maps an in-flight budget 402 to a retryable RATE_LIMITED that honours Retry-After', () => {
    const failure = failureFromHttp(402, body('openrouter_in_flight_budget'), 4000);
    expect(failure.error).toMatchObject({
      code: 'RATE_LIMITED',
      retryable: true,
      detail: 'Budget exceeded',
    });
    expect(failure.retryAfterMs).toBe(4000);
  });

  it('keeps a key-limit or credits 402 as a non-retryable INSUFFICIENT_CREDITS', () => {
    for (const source of ['openrouter_key_limit', 'openrouter_credits']) {
      const failure = failureFromHttp(402, body(source), 4000);
      expect(failure.error).toMatchObject({ code: 'INSUFFICIENT_CREDITS', retryable: false });
      expect(failure.retryAfterMs).toBeNull();
    }
  });

  it('treats a 402 with no limit_source as INSUFFICIENT_CREDITS', () => {
    const failure = failureFromHttp(402, 'no credits', null);
    expect(failure.error).toMatchObject({ code: 'INSUFFICIENT_CREDITS', retryable: false });
  });

  it('keeps an in-flight budget 402 retryable even when the server gives no wait', () => {
    const failure = failureFromHttp(402, body('openrouter_in_flight_budget'), null);
    expect(failure.error).toMatchObject({ code: 'RATE_LIMITED', retryable: true });
    expect(failure.retryAfterMs).toBeNull();
  });
});
