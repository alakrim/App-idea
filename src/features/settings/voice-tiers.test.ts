import { DEFAULT_NARRATION } from '@/core/defaults';
import type { OpenRouterModel } from '@/services/openrouter';

import {
  buildVoiceTiers,
  hourlyNarrationCost,
  narrationForModel,
  narratableModels,
  supportsStyleInstructions,
  tierForHourlyCost,
} from './voice-tiers';


function speech(id: string, prompt: number, completion: number, voices = 10): OpenRouterModel {
  return {
    id,
    name: id,
    contextLength: 0,
    pricing: { prompt, completion },
    inputModalities: ['text'],
    outputModalities: ['speech'],
    supportedParameters: [],
    supportedVoices: Array.from({ length: voices }, (_, index) => `voice-${index}`),
  };
}

// Prices are the live catalog figures the architect recorded (docs/research, ADR-0003).
const KOKORO = speech('hexgrad/kokoro-82m', 0.00000062, 0);
const GEMINI_FLASH_LITE = speech('google/gemini-3.8-flash-lite-tts', 0.0000005, 0.000006, 30);
const ELEVEN_V3 = speech('elevenlabs/eleven-v3', 0.00004, 0, 21);
const ORPHEUS = speech('canopylabs/orpheus-3b-0.1-ft', 0.000007, 0, 7);

describe('hourly narration cost', () => {
  it('prices a character-priced model at 54k characters an hour', () => {
    expect(hourlyNarrationCost(KOKORO)).toBeCloseTo(0.03348, 5);
    expect(hourlyNarrationCost(ELEVEN_V3)).toBeCloseTo(2.16, 5);
  });

  it('prices a token-priced model by audio tokens (25 a second) plus text tokens', () => {
    // 54k chars = 3600 s = 90k audio tokens at $6e-6, plus 13.5k text tokens at $5e-7.
    expect(hourlyNarrationCost(GEMINI_FLASH_LITE)).toBeCloseTo(
      90_000 * 0.000006 + 13_500 * 0.0000005,
      6,
    );
  });
});

describe('tiers', () => {
  it('classifies by the live hourly price', () => {
    expect(tierForHourlyCost(0.03)).toBe('budget');
    expect(tierForHourlyCost(0.15)).toBe('recommended');
    expect(tierForHourlyCost(1.49)).toBe('recommended');
    expect(tierForHourlyCost(1.5)).toBe('premium');
  });

  it('picks the default model as Recommended when the catalog still offers it', () => {
    const tiers = buildVoiceTiers([KOKORO, GEMINI_FLASH_LITE, ELEVEN_V3], DEFAULT_NARRATION.model);
    expect(tiers.map((tier) => [tier.id, tier.model.id])).toEqual([
      ['budget', 'hexgrad/kokoro-82m'],
      ['recommended', 'google/gemini-3.8-flash-lite-tts'],
      ['premium', 'elevenlabs/eleven-v3'],
    ]);
  });

  it('falls back to the cheapest mid-band model when the default has disappeared', () => {
    const tiers = buildVoiceTiers([KOKORO, ORPHEUS, ELEVEN_V3], 'google/gemini-3.8-flash-lite-tts');
    expect(tiers.find((tier) => tier.id === 'recommended')?.model.id).toBe(
      'canopylabs/orpheus-3b-0.1-ft',
    );
  });

  it('leaves out a tier with no candidate instead of guessing', () => {
    const tiers = buildVoiceTiers([KOKORO], 'google/gemini-3.8-flash-lite-tts');
    expect(tiers.map((tier) => tier.id)).toEqual(['budget']);
  });

  it('ignores speech models that list no voices', () => {
    const silent = speech('bytedance-seed/seed-audio-1-0', 0, 0.0025, 0);
    expect(narratableModels([silent, KOKORO])).toEqual([KOKORO]);
  });
});

describe('narration settings for a model', () => {
  const current = {
    provider: 'openrouter' as const,
    model: 'hexgrad/kokoro-82m',
    voice: 'voice-9',
    style: 'calm',
    speed: 1,
  };

  it('keeps the voice when the new model has it', () => {
    expect(narrationForModel(current, GEMINI_FLASH_LITE).voice).toBe('voice-9');
  });

  it('uses the first voice of the new model otherwise', () => {
    expect(narrationForModel(current, ORPHEUS).voice).toBe('voice-0');
  });

  it('keeps the style only for models that take steering instructions', () => {
    expect(narrationForModel(current, GEMINI_FLASH_LITE).style).toBe('calm');
    expect(narrationForModel(current, ORPHEUS).style).toBeNull();
  });

  it('recognises Gemini TTS and gpt-4o-mini-tts as steerable', () => {
    expect(supportsStyleInstructions('google/gemini-3.8-flash-lite-tts')).toBe(true);
    expect(supportsStyleInstructions('openai/gpt-4o-mini-tts')).toBe(true);
    expect(supportsStyleInstructions('hexgrad/kokoro-82m')).toBe(false);
  });
});
