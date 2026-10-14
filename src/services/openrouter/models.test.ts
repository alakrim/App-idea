import { createFakeFetch, hangUntilAborted, jsonResponse } from './__fixtures__/fake-fetch';
import { createModelCatalog, supportsStructuredOutput } from './models';
import { createTransport } from './transport';

import type { RecordedCall, Route } from './__fixtures__/fake-fetch';

const apiModel = {
  id: 'google/gemini-3.8-flash-lite-tts',
  name: 'Google: Gemini 3.8 Flash Lite TTS',
  context_length: 32768,
  pricing: { prompt: '0.0000005', completion: '0.000006' },
  architecture: { input_modalities: ['text'], output_modalities: ['speech'] },
  supported_parameters: ['structured_outputs'],
  supported_voices: ['Kore', 'Puck'],
  description: 'dropped by the schema',
};

interface SetupOptions {
  now?: () => number;
  ttlMs?: number;
  loadSnapshot?: () => string | null;
  onFetched?: (snapshot: string) => void;
}

function setup(route: Route, options: SetupOptions = {}) {
  const fake = createFakeFetch(route);
  let clock = 1_000;
  const now = options.now ?? (() => clock);
  const transport = createTransport({
    getApiKey: async () => 'sk-or-v1-TESTKEY',
    fetchImpl: fake.fetchImpl,
    baseUrl: 'https://openrouter.ai/api/v1',
    appUrl: 'https://lectio.app',
    appTitle: 'Lectio',
    timeoutMs: 1000,
    maxRetries: 0,
    sleep: async () => undefined,
    random: () => 0.5,
    now,
  });
  const catalog = createModelCatalog({
    transport,
    ttlMs: options.ttlMs ?? 60_000,
    now,
    loadSnapshot: options.loadSnapshot,
    onFetched: options.onFetched,
  });
  return {
    catalog,
    calls: fake.calls,
    advance(ms: number) {
      clock += ms;
    },
  };
}

/** The transport reads the key before it calls fetch, so a request is recorded a turn later. */
async function untilRequested(calls: readonly RecordedCall[]): Promise<void> {
  for (let turn = 0; turn < 50 && calls.length === 0; turn++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

/** A response that waits for the test to release it, so concurrent callers can overlap. */
function deferredRoute(body: unknown): { route: Route; release: () => void } {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    route: async () => {
      await gate;
      return jsonResponse(body);
    },
    release: () => release(),
  };
}

describe('model catalog', () => {
  it('requests the modality and maps the wire shape to our model type', async () => {
    const { catalog, calls } = setup(() => jsonResponse({ data: [apiModel] }));
    const models = await catalog.list({ outputModality: 'speech' });

    expect(calls[0]?.url).toBe('https://openrouter.ai/api/v1/models?output_modalities=speech');
    expect(models).toEqual([
      {
        id: 'google/gemini-3.8-flash-lite-tts',
        name: 'Google: Gemini 3.8 Flash Lite TTS',
        contextLength: 32768,
        pricing: { prompt: 0.0000005, completion: 0.000006 },
        inputModalities: ['text'],
        outputModalities: ['speech'],
        supportedParameters: ['structured_outputs'],
        supportedVoices: ['Kore', 'Puck'],
      },
    ]);
  });

  it('keeps valid models and drops malformed ones', async () => {
    const malformed = {
      id: 'bad/model',
      name: 'Bad',
      pricing: { prompt: 'free' },
      architecture: {},
    };
    const { catalog } = setup(() => jsonResponse({ data: [malformed, apiModel] }));
    const models = await catalog.list();
    expect(models.map((model) => model.id)).toEqual(['google/gemini-3.8-flash-lite-tts']);
  });

  it('serves repeat calls from the cache until the TTL expires', async () => {
    const { catalog, calls, advance } = setup(() => jsonResponse({ data: [apiModel] }), {
      ttlMs: 60_000,
    });
    await catalog.list();
    await catalog.list();
    expect(calls).toHaveLength(1);

    advance(60_001);
    await catalog.list();
    expect(calls).toHaveLength(2);
  });

  describe('snapshot persistence', () => {
    it('reports each successful fetch with a snapshot that a fresh catalog restores', async () => {
      const saved: string[] = [];
      const first = setup(() => jsonResponse({ data: [apiModel] }), {
        onFetched: (snapshot) => saved.push(snapshot),
      });
      await first.catalog.list({ outputModality: 'speech' });

      expect(saved).toHaveLength(1);
      const second = setup(
        () => {
          throw new Error('should not be called once the snapshot is restored');
        },
        { loadSnapshot: () => saved[0] ?? null },
      );
      const models = await second.catalog.list({ outputModality: 'speech' });
      expect(models[0]?.id).toBe('google/gemini-3.8-flash-lite-tts');
      expect(second.calls).toHaveLength(0);
    });

    it('does not report a cache hit, so the snapshot is written only after a network fetch', async () => {
      const onFetched = jest.fn();
      const { catalog } = setup(() => jsonResponse({ data: [apiModel] }), { onFetched });

      await catalog.list();
      await catalog.list();
      await catalog.list();

      expect(onFetched).toHaveBeenCalledTimes(1);
    });

    it('does not report a failed fetch', async () => {
      const onFetched = jest.fn();
      const { catalog } = setup(
        () => jsonResponse({ error: { message: 'down' } }, { status: 500 }),
        {
          onFetched,
        },
      );

      await expect(catalog.list()).rejects.toThrow();
      expect(onFetched).not.toHaveBeenCalled();
    });

    it('reads the saved snapshot on first use, not when the catalog is built', async () => {
      const loadSnapshot = jest.fn(() => null);
      const { catalog } = setup(() => jsonResponse({ data: [] }), { loadSnapshot });
      expect(loadSnapshot).not.toHaveBeenCalled();

      await catalog.list();
      await catalog.list({ outputModality: 'speech' });

      expect(loadSnapshot).toHaveBeenCalledTimes(1);
    });

    it('ignores an invalid saved snapshot and fetches the catalogue instead', async () => {
      const invalidPayloads = [
        'not json',
        JSON.stringify({ version: 2, entries: [] }),
        JSON.stringify({ version: 1, entries: [{ outputModality: 'x' }] }),
      ];
      for (const payload of invalidPayloads) {
        const { catalog, calls } = setup(() => jsonResponse({ data: [apiModel] }), {
          loadSnapshot: () => payload,
        });
        const models = await catalog.list({ outputModality: 'speech' });
        expect(models).toHaveLength(1);
        expect(calls).toHaveLength(1);
      }
    });
  });

  describe('in-flight de-duplication', () => {
    it('makes one request for concurrent calls on the same modality, and shares the result', async () => {
      const gate = deferredRoute({ data: [apiModel] });
      const { catalog, calls } = setup(gate.route);

      const pending = [catalog.list(), catalog.list(), catalog.list()];
      gate.release();
      const results = await Promise.all(pending);

      expect(calls).toHaveLength(1);
      expect(results[0]).toEqual(results[1]);
      expect(results[1]).toEqual(results[2]);
      expect(results[0]).toHaveLength(1);
    });

    it('keeps requests for different modalities separate', async () => {
      const gate = deferredRoute({ data: [apiModel] });
      const { catalog, calls } = setup(gate.route);

      const pending = [
        catalog.list({ outputModality: 'text' }),
        catalog.list({ outputModality: 'speech' }),
      ];
      gate.release();
      await Promise.all(pending);

      expect(calls.map((call) => call.url)).toEqual([
        'https://openrouter.ai/api/v1/models?output_modalities=text',
        'https://openrouter.ai/api/v1/models?output_modalities=speech',
      ]);
    });

    it('stops only the caller that aborts, and the others still get the models', async () => {
      const gate = deferredRoute({ data: [apiModel] });
      const { catalog, calls } = setup(gate.route);
      const abort = new AbortController();

      const cancelled = catalog.list({ signal: abort.signal });
      const kept = catalog.list();
      await untilRequested(calls);
      abort.abort();

      await expect(cancelled).rejects.toMatchObject({ error: { code: 'CANCELLED' } });
      gate.release();
      await expect(kept).resolves.toHaveLength(1);
      expect(calls).toHaveLength(1);
      expect(calls[0]?.signal?.aborted).toBe(false);
    });

    it('aborts the request when its last caller leaves', async () => {
      const { catalog, calls } = setup(hangUntilAborted);
      const abort = new AbortController();

      const pending = catalog.list({ signal: abort.signal });
      await untilRequested(calls);
      abort.abort();

      await expect(pending).rejects.toMatchObject({ error: { code: 'CANCELLED' } });
      expect(calls).toHaveLength(1);
      expect(calls[0]?.signal?.aborted).toBe(true);
    });

    it('starts a new request for a caller that arrives after the last one left', async () => {
      let requests = 0;
      const { catalog, calls } = setup((call: RecordedCall) =>
        requests++ === 0 ? hangUntilAborted(call) : jsonResponse({ data: [apiModel] }),
      );
      const abort = new AbortController();
      const cancelled = catalog.list({ signal: abort.signal });
      await untilRequested(calls);
      abort.abort();
      await expect(cancelled).rejects.toMatchObject({ error: { code: 'CANCELLED' } });

      await expect(catalog.list()).resolves.toHaveLength(1);
      expect(calls).toHaveLength(2);
    });

    it('rejects an already-aborted caller without making a request', async () => {
      const { catalog, calls } = setup(() => jsonResponse({ data: [apiModel] }));
      const abort = new AbortController();
      abort.abort();

      await expect(catalog.list({ signal: abort.signal })).rejects.toMatchObject({
        error: { code: 'CANCELLED' },
      });
      expect(calls).toHaveLength(0);
    });
  });
});

describe('model helpers', () => {
  it('detects structured output support from supported_parameters', () => {
    expect(supportsStructuredOutput({ supportedParameters: ['structured_outputs'] })).toBe(true);
    expect(supportsStructuredOutput({ supportedParameters: ['temperature'] })).toBe(false);
  });
});
