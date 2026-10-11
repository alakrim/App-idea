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

  describe('failureFromHttp refused settings (400)', () => {
    // The exact live body from the 2026-10-11 test: Gemini TTS refuses mp3.
    const LIVE_PCM_ONLY = JSON.stringify({
      error: { message: 'Gemini TTS only supports response_format="pcm"', code: 400 },
    });

    it('maps the live PCM-only 400 to a non-retryable, specific audio-format message', () => {
      const failure = failureFromHttp(400, LIVE_PCM_ONLY, null);
      expect(failure.error).toEqual({
        code: 'MODEL_UNAVAILABLE',
        message: "This voice model can't produce that audio format.",
        detail: 'Gemini TTS only supports response_format="pcm"',
        retryable: false,
      });
      expect(failure.retryAfterMs).toBeNull();
    });

    it('gives an unsupported setting that is not a format a settings message, not a retry', () => {
      const failure = failureFromHttp(
        400,
        JSON.stringify({ error: { message: 'instructions is unsupported for this model' } }),
        null,
      );
      expect(failure.error).toMatchObject({ code: 'MODEL_UNAVAILABLE', retryable: false });
      expect(failure.error.message).toMatch(/settings/);
      expect(failure.error.message).not.toMatch(/Try again/);
    });

    it('keeps a 400 that names no refused setting as a non-retryable generic failure', () => {
      const failure = failureFromHttp(
        400,
        JSON.stringify({ error: { message: 'bad schema' } }),
        null,
      );
      expect(failure.error).toMatchObject({ code: 'UNKNOWN', retryable: false });
    });

    it('keeps a model that is not supported on OpenRouter as a model message', () => {
      const failure = failureFromHttp(
        400,
        JSON.stringify({ error: { message: 'model acme/x is not supported' } }),
        null,
      );
      expect(failure.error).toMatchObject({ code: 'MODEL_UNAVAILABLE', retryable: false });
      expect(failure.error.message).toMatch(/not available on OpenRouter/);
    });

    it('never maps a refused 400 to the retryable generic "Try again"', () => {
      for (const message of [
        'Gemini TTS only supports response_format="pcm"',
        'unsupported parameter: speed',
        'output format wav is not supported',
      ]) {
        const failure = failureFromHttp(400, JSON.stringify({ error: { message } }), null);
        expect(failure.error.retryable).toBe(false);
        expect(failure.error.message).not.toMatch(/Try again/);
      }
    });
  });
});
