import type { ErrorCode } from '@/core/domain';

import {
  chatReply,
  createFakeFetch,
  errorResponse,
  hangUntilAborted,
  jsonResponse,
} from './__fixtures__/fake-fetch';
import { createOpenRouterClient } from './client';
import { PipelineFailure } from './errors';

import type { Route } from './__fixtures__/fake-fetch';
import type { OpenRouterClientOptions } from './client';

const FAKE_KEY = 'sk-or-v1-FAKEKEY0123456789abcdefghijklmnop';

function makeClient(route: Route, overrides: Partial<OpenRouterClientOptions> = {}) {
  const fake = createFakeFetch(route);
  const sleeps: number[] = [];
  const client = createOpenRouterClient({
    getApiKey: async () => FAKE_KEY,
    appUrl: 'https://lectio.app',
    appTitle: 'Lectio',
    fetchImpl: fake.fetchImpl,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    random: () => 0.5,
    ...overrides,
  });
  return { client, calls: fake.calls, sleeps };
}

async function captureFailure(promise: Promise<unknown>): Promise<PipelineFailure> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof PipelineFailure) return error;
    throw error;
  }
  throw new Error('expected the call to fail');
}

const okChat = () => chatReply('hello');

describe('request headers and URL', () => {
  it('sends the bearer key, attribution headers and JSON content type', async () => {
    const { client, calls } = makeClient(okChat);
    await client.chatText({ model: 'test/model', user: 'hi' });

    const call = calls[0];
    expect(call?.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(call?.method).toBe('POST');
    expect(call?.headers).toMatchObject({
      Authorization: `Bearer ${FAKE_KEY}`,
      'HTTP-Referer': 'https://lectio.app',
      'X-Title': 'Lectio',
      'X-OpenRouter-Title': 'Lectio',
      'Content-Type': 'application/json',
    });
  });

  it('builds query strings and honours a custom base URL', async () => {
    const { client, calls } = makeClient(() => jsonResponse({ data: [] }), {
      baseUrl: 'https://proxy.test/v1',
    });
    await client.models.list({ outputModality: 'speech' });
    expect(calls[0]?.url).toBe('https://proxy.test/v1/models?output_modalities=speech');
  });

  it('fails with AUTH and makes no request when no key is saved', async () => {
    const { client, calls } = makeClient(okChat, { getApiKey: async () => null });
    const failure = await captureFailure(client.chatText({ model: 'm', user: 'hi' }));
    expect(failure.error.code).toBe('AUTH');
    expect(calls).toHaveLength(0);
  });
});

describe('error mapping', () => {
  it.each<[string, () => Response, ErrorCode, boolean]>([
    ['401', () => errorResponse(401, 'bad key'), 'AUTH', false],
    ['402', () => errorResponse(402, 'no credits'), 'INSUFFICIENT_CREDITS', false],
    ['403 generic', () => errorResponse(403, 'forbidden'), 'AUTH', false],
    [
      '403 budget',
      () =>
        jsonResponse(
          { error: { message: 'limit', metadata: { limit_source: 'openrouter_key_limit' } } },
          { status: 403 },
        ),
      'INSUFFICIENT_CREDITS',
      false,
    ],
    ['404', () => errorResponse(404, 'not found'), 'MODEL_UNAVAILABLE', false],
    [
      '400 model not found',
      () => errorResponse(400, 'Model not found: x/y'),
      'MODEL_UNAVAILABLE',
      false,
    ],
    [
      '400 no endpoints',
      () => errorResponse(400, 'No endpoints found that support structured outputs'),
      'MODEL_UNAVAILABLE',
      false,
    ],
    ['400 other', () => errorResponse(400, 'bad schema'), 'UNKNOWN', false],
    ['429', () => errorResponse(429, 'slow down'), 'RATE_LIMITED', true],
    ['500', () => errorResponse(500, 'boom'), 'UNKNOWN', true],
    ['503', () => errorResponse(503, 'no provider'), 'UNKNOWN', true],
  ])('maps HTTP %s', async (_label, respond, code, retryable) => {
    const { client } = makeClient(respond, { maxRetries: 0 });
    const failure = await captureFailure(client.chatText({ model: 'm', user: 'hi' }));
    expect(failure.error.code).toBe(code);
    expect(failure.error.retryable).toBe(retryable);
    expect(failure.error.message.length).toBeGreaterThan(10);
  });

  it('never puts the key in the thrown error', async () => {
    const { client } = makeClient(() => errorResponse(500, `upstream echoed ${FAKE_KEY} back`), {
      maxRetries: 0,
    });
    const failure = await captureFailure(client.chatText({ model: 'm', user: 'hi' }));
    expect(failure.error.detail).toContain('[redacted]');
    const serialized = JSON.stringify(failure.error) + failure.message + String(failure.stack);
    expect(serialized).not.toContain(FAKE_KEY);
    expect(serialized).not.toContain('FAKEKEY0123456789');
  });

  it('maps a network failure to NETWORK without copying the raw message', async () => {
    const { client } = makeClient(
      () => {
        throw new TypeError(`Network request failed for ${FAKE_KEY}`);
      },
      { maxRetries: 0 },
    );
    const failure = await captureFailure(client.chatText({ model: 'm', user: 'hi' }));
    expect(failure.error.code).toBe('NETWORK');
    expect(failure.error.retryable).toBe(true);
    expect(JSON.stringify(failure.error)).not.toContain(FAKE_KEY);
  });
});

describe('retries and backoff', () => {
  it('retries 429 and honours retry-after', async () => {
    let attempts = 0;
    const { client, sleeps } = makeClient(() => {
      attempts += 1;
      return attempts === 1 ? errorResponse(429, 'slow', { 'retry-after': '2' }) : okChat();
    });
    const result = await client.chatText({ model: 'm', user: 'hi' });
    expect(result.text).toBe('hello');
    expect(attempts).toBe(2);
    expect(sleeps).toEqual([2000]);
  });

  it('gives up after maxRetries (3 retries, 4 attempts in total)', async () => {
    const { client, calls, sleeps } = makeClient(() => errorResponse(500, 'down'));
    const failure = await captureFailure(client.chatText({ model: 'm', user: 'hi' }));
    expect(failure.error.code).toBe('UNKNOWN');
    expect(calls).toHaveLength(4);
    // random() is 0.5 in makeClient, so each delay is 75% of its exponential step.
    expect(sleeps).toEqual([375, 750, 1500]);
  });

  it('does not retry 401', async () => {
    const { client, calls } = makeClient(() => errorResponse(401, 'bad key'));
    await captureFailure(client.chatText({ model: 'm', user: 'hi' }));
    expect(calls).toHaveLength(1);
  });

  it('retries a transient network failure', async () => {
    let attempts = 0;
    const { client } = makeClient(() => {
      attempts += 1;
      if (attempts === 1) throw new TypeError('socket hang up');
      return okChat();
    });
    await expect(client.chatText({ model: 'm', user: 'hi' })).resolves.toMatchObject({
      text: 'hello',
    });
    expect(attempts).toBe(2);
  });
});

describe('timeouts and cancellation', () => {
  it('times out with a retryable NETWORK error', async () => {
    const { client, calls } = makeClient(hangUntilAborted, { timeoutMs: 5, maxRetries: 0 });
    const check = await client.validateKey();
    expect(check).toMatchObject({ valid: false, error: { code: 'NETWORK', retryable: true } });
    expect(check.valid ? '' : check.error.message).toMatch(/too long/);
    expect(calls).toHaveLength(1);
  });

  it('cancels when the caller aborts mid-flight, without retrying', async () => {
    const controller = new AbortController();
    const { client, calls } = makeClient(hangUntilAborted, { timeoutMs: 60_000 });
    const pending = captureFailure(
      client.chatText({ model: 'm', user: 'hi', signal: controller.signal }),
    );
    // Let the key lookup finish so the request is in flight before the abort.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toHaveLength(1);
    controller.abort();
    const failure = await pending;
    expect(failure.error.code).toBe('CANCELLED');
    expect(failure.error.retryable).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it('does not send a request when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const { client, calls } = makeClient(okChat);
    const failure = await captureFailure(
      client.chatText({ model: 'm', user: 'hi', signal: controller.signal }),
    );
    expect(failure.error.code).toBe('CANCELLED');
    expect(calls).toHaveLength(0);
  });

  it('stops waiting between retries when the caller aborts', async () => {
    const controller = new AbortController();
    const { client, calls } = makeClient(() => errorResponse(500, 'down'), {
      sleep: () => new Promise<void>(() => undefined),
    });
    const pending = captureFailure(
      client.chatText({ model: 'm', user: 'hi', signal: controller.signal }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();
    const failure = await pending;
    expect(failure.error.code).toBe('CANCELLED');
    expect(calls).toHaveLength(1);
  });
});

describe('per-call timeouts', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('gives a chat call 120 s before it times out', async () => {
    const { client, calls } = makeClient(hangUntilAborted, { maxRetries: 0 });
    const pending = captureFailure(client.chatText({ model: 'm', user: 'hi' }));
    await jest.advanceTimersByTimeAsync(119_999);
    expect(calls).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(1);
    expect((await pending).error).toMatchObject({ code: 'NETWORK', retryable: true });
  });

  it('gives a speech call 180 s before it times out', async () => {
    const { client, calls } = makeClient(hangUntilAborted, { maxRetries: 0 });
    const pending = captureFailure(
      client.synthesizeSpeech({ model: 'm', voice: 'v', input: 'Hello there.', format: 'mp3' }),
    );
    await jest.advanceTimersByTimeAsync(179_999);
    expect(calls).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(1);
    expect((await pending).error).toMatchObject({ code: 'NETWORK', retryable: true });
  });

  it('keeps the 60 s default for the short calls', async () => {
    const { client } = makeClient(hangUntilAborted, { maxRetries: 0 });
    const pending = client.validateKey();
    let settled = false;
    void pending.then(() => (settled = true));
    await jest.advanceTimersByTimeAsync(59_999);
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(await pending).toMatchObject({ valid: false, error: { code: 'NETWORK' } });
  });
});
