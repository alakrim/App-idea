import { createFakeFetch, jsonResponse } from './__fixtures__/fake-fetch';
import {
  CATALOG_TTL_MS,
  createModelCatalog,
  parseModelItems,
  supportsStructuredOutput,
  voicesFor,
} from './models';
import { createTransport } from './transport';

import type { OutputModality } from './models';

const apiModel = {
  id: 'google/gemini-3.8-flash-lite-tts',
  name: 'Google: Gemini 3.8 Flash Lite TTS',
  context_length: 32768,
  created: 1790200276,
  pricing: { prompt: '0.0000005', completion: '0.000006' },
  architecture: { input_modalities: ['text'], output_modalities: ['speech'] },
  supported_parameters: ['structured_outputs'],
  supported_voices: ['Kore', 'Puck'],
  description: 'dropped by the schema',
};

/** The same TTL for every modality. */
function uniformTtl(ms: number): Readonly<Record<OutputModality, number>> {
  return { text: ms, speech: ms, embeddings: ms };
}

function setup(
  respond: () => Response,
  options: { now?: () => number; ttlMs?: Readonly<Record<OutputModality, number>> } = {},
) {
  const fake = createFakeFetch(respond);
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
    ttlMs: options.ttlMs ?? CATALOG_TTL_MS,
    now,
  });
  return {
    catalog,
    calls: fake.calls,
    advance(ms: number) {
      clock += ms;
    },
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
        createdAt: 1790200276000,
      },
    ]);
  });

  it('reads a missing, null or non-numeric created date as no date, and keeps the model', () => {
    const models = parseModelItems([
      { ...apiModel, created: undefined },
      { ...apiModel, id: 'vendor/null-date', created: null },
      { ...apiModel, id: 'vendor/text-date', created: 'yesterday' },
    ]);
    expect(models.map((model) => [model.id, model.createdAt])).toEqual([
      ['google/gemini-3.8-flash-lite-tts', null],
      ['vendor/null-date', null],
      ['vendor/text-date', null],
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
      ttlMs: uniformTtl(60_000),
    });
    await catalog.list();
    await catalog.list();
    expect(calls).toHaveLength(1);

    advance(60_001);
    await catalog.list();
    expect(calls).toHaveLength(2);
  });

  it('expires speech lists after 10 minutes and text lists after an hour', async () => {
    const minute = 60_000;
    const { catalog, calls, advance } = setup(() => jsonResponse({ data: [apiModel] }));
    await catalog.list({ outputModality: 'speech' });
    await catalog.list();

    advance(10 * minute - 1);
    await catalog.list({ outputModality: 'speech' });
    expect(calls).toHaveLength(2);

    advance(1);
    await catalog.list({ outputModality: 'speech' });
    expect(calls).toHaveLength(3);

    // The text list was fetched at t=0, so it lasts until t=60 minutes.
    advance(50 * minute - 1);
    await catalog.list();
    expect(calls).toHaveLength(3);
    advance(1);
    await catalog.list();
    expect(calls).toHaveLength(4);
  });

  it('asks OpenRouter again when fresh is set, even inside the TTL, and refreshes the cache', async () => {
    const { catalog, calls, advance } = setup(() => jsonResponse({ data: [apiModel] }));
    await catalog.list({ outputModality: 'speech' });
    await catalog.list({ outputModality: 'speech', fresh: true });
    expect(calls).toHaveLength(2);

    advance(9 * 60_000);
    await catalog.list({ outputModality: 'speech' });
    expect(calls).toHaveLength(2);
  });

  it('restores a snapshot written before models had a date, reading the date as absent', async () => {
    const legacy = JSON.stringify({
      version: 1,
      entries: [
        {
          outputModality: 'speech',
          fetchedAt: 1,
          models: [
            {
              id: 'google/gemini-3.8-flash-lite-tts',
              name: 'Google: Gemini 3.8 Flash Lite TTS',
              contextLength: 0,
              pricing: { prompt: 0.0000005, completion: 0.000006 },
              inputModalities: ['text'],
              outputModalities: ['speech'],
              supportedParameters: [],
              supportedVoices: ['Kore'],
            },
          ],
        },
      ],
    });
    const { catalog, calls } = setup(() => {
      throw new Error('should not be called after hydrate');
    });
    expect(catalog.hydrate(legacy)).toBe(true);
    const [model] = await catalog.list({ outputModality: 'speech' });
    expect(model?.createdAt).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('keeps the date when a snapshot is written and restored', async () => {
    const first = setup(() => jsonResponse({ data: [apiModel] }));
    await first.catalog.list({ outputModality: 'speech' });
    const second = setup(() => {
      throw new Error('should not be called after hydrate');
    });
    second.catalog.hydrate(first.catalog.serialize());
    const [model] = await second.catalog.list({ outputModality: 'speech' });
    expect(model?.createdAt).toBe(1790200276000);
  });

  it('serialises the cache and restores it in a fresh catalog', async () => {
    const first = setup(() => jsonResponse({ data: [apiModel] }));
    await first.catalog.list({ outputModality: 'speech' });
    const snapshot = first.catalog.serialize();

    const second = setup(() => {
      throw new Error('should not be called after hydrate');
    });
    expect(second.catalog.hydrate(snapshot)).toBe(true);
    const models = await second.catalog.list({ outputModality: 'speech' });
    expect(models[0]?.id).toBe('google/gemini-3.8-flash-lite-tts');
    expect(second.calls).toHaveLength(0);
  });

  it('rejects an invalid snapshot without throwing or changing the cache', () => {
    const { catalog } = setup(() => jsonResponse({ data: [] }));
    expect(catalog.hydrate('not json')).toBe(false);
    expect(catalog.hydrate(JSON.stringify({ version: 2, entries: [] }))).toBe(false);
    expect(
      catalog.hydrate(JSON.stringify({ version: 1, entries: [{ outputModality: 'x' }] })),
    ).toBe(false);
  });
});

describe('model helpers', () => {
  it('detects structured output support from supported_parameters', () => {
    expect(supportsStructuredOutput({ supportedParameters: ['structured_outputs'] })).toBe(true);
    expect(supportsStructuredOutput({ supportedParameters: ['temperature'] })).toBe(false);
  });

  it('lists the voices a model supports, or none', () => {
    expect(voicesFor({ supportedVoices: ['Kore'] })).toEqual(['Kore']);
    expect(voicesFor({ supportedVoices: [] })).toEqual([]);
  });
});
