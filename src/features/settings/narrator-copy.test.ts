import { NARRATOR_OPTIONS, type NarratorId } from '@/core/narration/options';
import type { OpenRouterModel } from '@/services/openrouter';

import {
  languageLine,
  narratorPrice,
  priceLabel,
  shortLanguageName,
  unsupportedLabel,
} from './narrator-copy';

import type { CatalogState } from './model-catalog';

function narrator(id: NarratorId) {
  const found = NARRATOR_OPTIONS.find((option) => option.id === id);
  if (!found) throw new Error(`no narrator ${id}`);
  return found;
}

function model(id: string, prompt: number, completion: number): OpenRouterModel {
  return {
    id,
    name: id,
    contextLength: 0,
    pricing: { prompt, completion },
    inputModalities: ['text'],
    outputModalities: ['speech'],
    supportedParameters: [],
    supportedVoices: ['voice'],
    createdAt: null,
  };
}

const LIVE: CatalogState = {
  status: 'live',
  models: [
    // Live prices as recorded by the architect (docs/research, ADR-0003).
    model('google/gemini-3.8-flash-lite-tts', 0.0000005, 0.000006),
    model('hexgrad/kokoro-82m', 0.00000062, 0),
    model('fish-audio/s2.1-pro-free:free', 0, 0),
  ],
};

describe('narratorPrice', () => {
  it('reads the live hourly price of a listed narrator', () => {
    const price = narratorPrice(narrator('budget'), LIVE);
    expect(price.status).toBe('known');
    if (price.status === 'known') expect(price.usdPerHour).toBeCloseTo(0.03348, 4);
  });

  it('is loading, unavailable or unlisted until the catalogue says otherwise', () => {
    expect(narratorPrice(narrator('best'), { status: 'loading' })).toEqual({ status: 'loading' });
    expect(narratorPrice(narrator('best'), { status: 'unavailable', message: 'offline' })).toEqual({
      status: 'unavailable',
    });
    expect(narratorPrice(narrator('best'), { status: 'live', models: [] })).toEqual({
      status: 'unlisted',
    });
  });
});

describe('priceLabel', () => {
  it('says Free for zero, a bound under a cent, and the rounded hourly price otherwise', () => {
    expect(priceLabel({ status: 'known', usdPerHour: 0 })).toBe('Free');
    expect(priceLabel({ status: 'known', usdPerHour: 0.001 })).toBe('Under $0.01 per hour');
    expect(priceLabel({ status: 'known', usdPerHour: 0.03348 })).toBe('About $0.03 per hour');
    expect(priceLabel({ status: 'known', usdPerHour: 0.55 })).toBe('About $0.55 per hour');
    expect(priceLabel({ status: 'known', usdPerHour: 2.16 })).toBe('About $2.16 per hour');
  });

  it('describes the states that have no price', () => {
    expect(priceLabel({ status: 'loading' })).toBe('Checking the price…');
    expect(priceLabel({ status: 'unavailable' })).toBe('Price unavailable right now');
    expect(priceLabel({ status: 'unlisted' })).toBe('Not offered right now');
  });
});

describe('language copy', () => {
  it('names a short language, without the region or script in brackets', () => {
    expect(shortLanguageName('pt-BR')).toBe('Portuguese');
    expect(shortLanguageName('pt-PT')).toBe('Portuguese');
    expect(shortLanguageName('zh')).toBe('Chinese');
    expect(shortLanguageName('it')).toBe('Italian');
    expect(shortLanguageName('xx')).toBe('xx');
  });

  it('lists every language for a multilingual narrator, and the set for Kokoro', () => {
    expect(languageLine(narrator('best'))).toBe('All languages');
    expect(languageLine(narrator('budget'))).toBe(
      '8 languages: English, Spanish, French, Hindi, Italian, Japanese, Portuguese, Chinese',
    );
  });

  it('explains an unsupported target language in plain words', () => {
    expect(unsupportedLabel('de')).toBe('Not available for German');
  });
});
