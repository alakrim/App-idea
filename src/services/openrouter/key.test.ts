import { createFakeFetch, errorResponse, jsonResponse } from './__fixtures__/fake-fetch';
import { createOpenRouterClient } from './client';

import type { Route } from './__fixtures__/fake-fetch';

function makeClient(
  route: Route,
  getApiKey: () => Promise<string | null> = async () => 'sk-or-v1-K',
) {
  const fake = createFakeFetch(route);
  const client = createOpenRouterClient({
    getApiKey,
    appUrl: 'https://lectio.app',
    appTitle: 'Lectio',
    fetchImpl: fake.fetchImpl,
    maxRetries: 0,
  });
  return { client, calls: fake.calls };
}

describe('validateKey', () => {
  it('maps GET /key to a valid result with usage and limits', async () => {
    const { client, calls } = makeClient(() =>
      jsonResponse({
        data: {
          label: 'sk-or-v1-au7...890',
          limit: 100,
          limit_remaining: 74.5,
          usage: 25.5,
          is_free_tier: false,
          budgets: [],
        },
      }),
    );

    const result = await client.validateKey();

    expect(calls[0]?.url).toBe('https://openrouter.ai/api/v1/key');
    expect(result).toEqual({
      valid: true,
      label: 'sk-or-v1-au7...890',
      usage: 25.5,
      limit: 100,
      limitRemaining: 74.5,
      isFreeTier: false,
    });
  });

  it('treats a missing limit as no cap', async () => {
    const { client } = makeClient(() =>
      jsonResponse({ data: { label: 'k', limit: null, usage: 0 } }),
    );
    await expect(client.validateKey()).resolves.toMatchObject({
      valid: true,
      limit: null,
      limitRemaining: null,
      isFreeTier: false,
    });
  });

  it('returns valid false with AUTH when the key is rejected', async () => {
    const { client } = makeClient(() => errorResponse(401, 'No cookie auth credentials found'));
    const result = await client.validateKey();
    expect(result).toEqual({
      valid: false,
      error: expect.objectContaining({ code: 'AUTH', retryable: false }),
    });
  });

  it('returns valid false with AUTH and no request when no key is saved', async () => {
    const { client, calls } = makeClient(
      () => jsonResponse({}),
      async () => null,
    );
    const result = await client.validateKey();
    expect(result).toEqual({
      valid: false,
      error: expect.objectContaining({ code: 'AUTH' }),
    });
    expect(calls).toHaveLength(0);
  });

  it('returns valid false with NETWORK when OpenRouter cannot be reached', async () => {
    const { client } = makeClient(() => {
      throw new TypeError('fetch failed');
    });
    const result = await client.validateKey();
    expect(result).toEqual({
      valid: false,
      error: expect.objectContaining({ code: 'NETWORK', retryable: true }),
    });
  });
});
