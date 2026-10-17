import { DEFAULT_MODELS, DEFAULT_NARRATION, DEFAULT_SETTINGS } from '@/core/defaults';
import type { OpenRouterModel } from '@/services/openrouter';

import { isModelMissing, readCachedCatalog } from './model-catalog';
import { modelKindConfig, parseModelKind } from './model-kinds';

function text(id: string, parameters: string[]): OpenRouterModel {
  return {
    id,
    name: id,
    contextLength: 128_000,
    pricing: { prompt: 0.000001, completion: 0.000005 },
    inputModalities: ['text'],
    outputModalities: ['text'],
    supportedParameters: parameters,
    supportedVoices: [],
    createdAt: null,
  };
}

describe('model picker kinds', () => {
  it('only accepts known kinds from the route', () => {
    expect(parseModelKind('analysis')).toBe('analysis');
    expect(parseModelKind('voice')).toBeNull();
    expect(parseModelKind(undefined)).toBeNull();
  });

  it('keeps only models with structured output for text settings', () => {
    const config = modelKindConfig('analysis', DEFAULT_SETTINGS);
    expect(config.accept(text('a/structured', ['structured_outputs']))).toBe(true);
    expect(config.accept(text('a/plain', ['temperature']))).toBe(false);
  });

  it('writes the picked model into the matching setting only', () => {
    const picked = text('vendor/new-model', ['structured_outputs']);
    expect(modelKindConfig('translation', DEFAULT_SETTINGS).patchFor(picked)).toEqual({
      translationModel: 'vendor/new-model',
    });
    expect(modelKindConfig('cleanup', DEFAULT_SETTINGS).patchFor(picked)).toEqual({
      cleanupModel: 'vendor/new-model',
    });
  });

  it('recommends the defaults from core/defaults', () => {
    expect(modelKindConfig('translation', DEFAULT_SETTINGS).recommendedId).toBe(
      DEFAULT_MODELS.translation,
    );
    expect(modelKindConfig('narration', DEFAULT_SETTINGS).recommendedId).toBe(
      DEFAULT_NARRATION.model,
    );
  });

  it('keeps the saved narration voice when the picked model offers it', () => {
    const config = modelKindConfig('narration', DEFAULT_SETTINGS);
    const model: OpenRouterModel = {
      ...text('google/gemini-3.8-flash-lite-tts', []),
      outputModalities: ['speech'],
      supportedVoices: ['Kore', 'Puck'],
      createdAt: null,
    };
    expect(config.patchFor(model).narration?.voice).toBe('Kore');
  });
});

describe('narration picker kind', () => {
  const NOW = 1_800_000_000_000;
  const DAY = 24 * 60 * 60 * 1000;

  function speechModel(id: string, voices: string[], createdAt: number | null): OpenRouterModel {
    return {
      ...text(id, []),
      outputModalities: ['speech'],
      supportedVoices: voices,
      createdAt,
    };
  }

  it('describes a model with no preset voices as using its default voice', () => {
    const config = modelKindConfig('narration', DEFAULT_SETTINGS);
    const drama = speechModel('fish-audio/drama-3', [], NOW);
    expect(config.describe(drama)).toMatch(/^Default voice · /);
    expect(config.describe(speechModel('vendor/voices', ['A', 'B'], NOW))).toMatch(/^2 voices · /);
  });

  it('badges a model created in the last 30 days as new, at the clock it is given', () => {
    const config = modelKindConfig('narration', DEFAULT_SETTINGS);
    expect(config.isNew(speechModel('fish-audio/drama-3', [], NOW - 4 * DAY), NOW)).toBe(true);
    expect(config.isNew(speechModel('vendor/old', [], NOW - 31 * DAY), NOW)).toBe(false);
    expect(config.isNew(speechModel('vendor/undated', [], null), NOW)).toBe(false);
  });

  it('accepts every speech model but Seed Audio, including voice-less ones', () => {
    const config = modelKindConfig('narration', DEFAULT_SETTINGS);
    expect(config.accept(speechModel('fish-audio/drama-3', [], NOW))).toBe(true);
    expect(config.accept(speechModel('bytedance-seed/seed-audio-1-0', [], NOW))).toBe(false);
  });

  it('keeps text pickers in catalogue order with no new badges', () => {
    const second = { ...text('b/second', []), createdAt: NOW };
    const models = [second, text('a/first', [])];
    const config = modelKindConfig('analysis', DEFAULT_SETTINGS);
    expect(config.arrange(models).map((model) => model.id)).toEqual(['b/second', 'a/first']);
    expect(config.isNew(second, NOW)).toBe(false);
  });
});

describe('missing model state', () => {
  const models = [text('a/one', [])];

  it('flags a saved model that the loaded catalog no longer offers', () => {
    expect(isModelMissing({ status: 'live', models }, 'a/gone')).toBe(true);
    expect(isModelMissing({ status: 'cached', models, savedAt: 1 }, 'a/one')).toBe(false);
  });

  it('does not flag anything while loading or when the catalog is unavailable', () => {
    expect(isModelMissing({ status: 'loading' }, 'a/gone')).toBe(false);
    expect(isModelMissing({ status: 'unavailable', message: 'offline' }, 'a/gone')).toBe(false);
  });
});

describe('offline catalog snapshot', () => {
  const snapshot = JSON.stringify({
    version: 1,
    entries: [
      {
        outputModality: 'text',
        fetchedAt: 1234,
        models: [
          {
            id: 'a/one',
            name: 'One',
            contextLength: 1,
            pricing: { prompt: 0, completion: 0 },
            inputModalities: ['text'],
            outputModalities: ['text'],
            supportedParameters: [],
            supportedVoices: [],
          },
        ],
      },
    ],
  });

  it('reads the saved models for the requested modality', () => {
    const cached = readCachedCatalog('text', () => snapshot);
    expect(cached?.savedAt).toBe(1234);
    expect(cached?.models.map((model) => model.id)).toEqual(['a/one']);
    expect(cached?.models[0]?.createdAt).toBeNull();
    expect(readCachedCatalog('speech', () => snapshot)).toBeNull();
  });

  it('treats a missing, broken or invalid snapshot as no cache', () => {
    expect(readCachedCatalog('text', () => null)).toBeNull();
    expect(readCachedCatalog('text', () => '{not json')).toBeNull();
    expect(readCachedCatalog('text', () => JSON.stringify({ version: 2 }))).toBeNull();
  });
});
