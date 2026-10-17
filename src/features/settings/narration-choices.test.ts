import { DEFAULT_NARRATION } from '@/core/defaults';
import {
  FREE_NARRATOR_MODEL_ID,
  NARRATOR_OPTIONS,
  type NarratorId,
} from '@/core/narration/options';
import { parseModelItems, type OpenRouterModel } from '@/services/openrouter';
import catalogue from '@/services/openrouter/__fixtures__/openrouter-speech-2026-10-17.json';

import {
  arrangeSpeechModels,
  hourlyNarrationCost,
  narrationForDevice,
  narrationForModel,
  narrationForOption,
  narrationWithVoice,
  narratableModels,
} from './narration-choices';

/** The live speech catalogue of 2026-10-17, parsed the way the app parses it. */
const LIVE = parseModelItems(catalogue.data);
const liveModel = (id: string): OpenRouterModel => {
  const found = LIVE.find((model) => model.id === id);
  if (!found) throw new Error(`no live model ${id}`);
  return found;
};

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
    createdAt: null,
  };
}

// Prices are the live catalog figures the architect recorded (docs/research, ADR-0003).
const KOKORO = speech('hexgrad/kokoro-82m', 0.00000062, 0);
const GEMINI_FLASH_LITE = speech('google/gemini-3.8-flash-lite-tts', 0.0000005, 0.000006, 30);
const ORPHEUS = speech('canopylabs/orpheus-3b-0.1-ft', 0.000007, 0, 7);
const FREE = speech(FREE_NARRATOR_MODEL_ID, 0, 0, 0);
const ELEVEN_V3 = speech('elevenlabs/eleven-v3', 0.00004, 0, 21);

describe('hourly narration cost', () => {
  it('prices a character-priced model at 54k characters an hour', () => {
    expect(hourlyNarrationCost(KOKORO)).toBeCloseTo(0.03348, 5);
    expect(hourlyNarrationCost(ELEVEN_V3)).toBeCloseTo(2.16, 5);
  });

  it('prices the free narrator at nothing', () => {
    expect(hourlyNarrationCost(FREE)).toBe(0);
  });

  it('prices a token-priced model by audio tokens (25 a second) plus text tokens', () => {
    // 54k chars = 3600 s = 90k audio tokens at $6e-6, plus 13.5k text tokens at $5e-7.
    expect(hourlyNarrationCost(GEMINI_FLASH_LITE)).toBeCloseTo(
      90_000 * 0.000006 + 13_500 * 0.0000005,
      6,
    );
  });
});

describe('narratableModels', () => {
  it('keeps every speech model of the live catalogue except Seed Audio', () => {
    const ids = narratableModels(LIVE).map((model) => model.id);
    expect(LIVE).toHaveLength(35);
    expect(ids).toHaveLength(34);
    expect(ids).not.toContain('bytedance-seed/seed-audio-1-0');
  });

  it('includes Fish Audio Drama 3, which lists no preset voices', () => {
    const drama = liveModel('fish-audio/drama-3');
    expect(drama.supportedVoices).toEqual([]);
    expect(narratableModels([drama])).toEqual([drama]);
  });

  it('drops a model whose output is not speech', () => {
    const text = { ...liveModel('fish-audio/drama-3'), outputModalities: ['text'] };
    expect(narratableModels([text])).toEqual([]);
  });
});

describe('arrangeSpeechModels', () => {
  const dated = (id: string, name: string, createdAt: number | null): OpenRouterModel => ({
    ...speech(id, 0, 0, 0),
    name,
    createdAt,
  });

  it('puts the three curated narrators first, in their own order, whatever their dates', () => {
    const arranged = arrangeSpeechModels([
      dated('fish-audio/drama-3', 'Fish Audio: Drama 3', 9_000),
      dated(FREE_NARRATOR_MODEL_ID, 'Fish Audio: S2.1 Pro Free', 1),
      dated('hexgrad/kokoro-82m', 'hexgrad: Kokoro 82M', 2),
      dated(GEMINI_FLASH_LITE.id, 'Google: Gemini', 3),
    ]);
    expect(arranged.map((model) => model.id)).toEqual([
      GEMINI_FLASH_LITE.id,
      'hexgrad/kokoro-82m',
      FREE_NARRATOR_MODEL_ID,
      'fish-audio/drama-3',
    ]);
  });

  it('orders the rest newest first on the live catalogue', () => {
    const ids = arrangeSpeechModels(LIVE).map((model) => model.id);
    expect(ids.slice(0, 3)).toEqual([GEMINI_FLASH_LITE.id, KOKORO.id, FREE_NARRATOR_MODEL_ID]);
    expect(ids.slice(3, 6)).toEqual([
      'heygen/heygen-voice-1',
      'heygen/heygen-voice-1-turbo',
      'fish-audio/drama-3',
    ]);
  });

  it('puts a model with no date after the dated ones, and breaks ties by name then id', () => {
    const arranged = arrangeSpeechModels([
      dated('vendor/undated', 'Vendor: Undated', null),
      dated('vendor/b-same', 'Vendor: Same B', 5),
      dated('vendor/z-older', 'Vendor: Older', 4),
      dated('vendor/a-same', 'Vendor: Same A', 5),
      dated('vendor/a-undated', 'Vendor: Aardvark', null),
    ]);
    expect(arranged.map((model) => model.id)).toEqual([
      'vendor/a-same',
      'vendor/b-same',
      'vendor/z-older',
      'vendor/a-undated',
      'vendor/undated',
    ]);
  });

  it('does not change the list it was given', () => {
    const input = [dated('vendor/a', 'A', 1), dated('vendor/b', 'B', 2)];
    const snapshot = input.map((model) => model.id);
    arrangeSpeechModels(input);
    expect(input.map((model) => model.id)).toEqual(snapshot);
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

  it('uses the first voice that speaks the language when one is given', () => {
    const it = speech('microsoft/mai-voice-2.1-flash', 0, 0, 0);
    const mai = {
      ...it,
      supportedVoices: ['en-US-Ethan:MAI-Voice-2.1-Flash', 'it-IT-Grant:MAI-Voice-2.1-Flash'],
      createdAt: null,
    };
    expect(narrationForModel(current, mai, 'it').voice).toBe('it-IT-Grant:MAI-Voice-2.1-Flash');
  });

  it('takes the empty voice for a model with no voices', () => {
    expect(narrationForModel(current, FREE).voice).toBe('');
  });

  it('keeps the style only for models that take steering instructions', () => {
    expect(narrationForModel(current, GEMINI_FLASH_LITE).style).toBe('calm');
    expect(narrationForModel(current, ORPHEUS).style).toBeNull();
  });
});

function narrator(id: NarratorId) {
  const found = NARRATOR_OPTIONS.find((option) => option.id === id);
  if (!found) throw new Error(`no narrator ${id}`);
  return found;
}

describe('narrationForOption', () => {
  const current = { ...DEFAULT_NARRATION, speed: 1.1 };

  it('selects the narrator model with its default voice for the language', () => {
    const next = narrationForOption(
      { ...current, model: 'hexgrad/kokoro-82m', voice: 'af_alloy', style: 'calm' },
      narrator('best'),
      'it',
      ['Puck', 'Kore'],
    );
    expect(next).toEqual({
      provider: 'openrouter',
      model: 'google/gemini-3.8-flash-lite-tts',
      voice: 'Kore',
      style: 'calm',
      speed: 1.1,
    });
  });

  it('sets the Kokoro voice for the target language and clears the style', () => {
    const next = narrationForOption(current, narrator('budget'), 'it', ['af_heart', 'if_sara']);
    expect(next).toMatchObject({ model: 'hexgrad/kokoro-82m', voice: 'if_sara', style: null });
  });

  it('gives the free narrator the empty voice and no style', () => {
    expect(narrationForOption(current, narrator('free'), 'en', [])).toMatchObject({
      model: FREE_NARRATOR_MODEL_ID,
      voice: '',
      style: null,
    });
  });

  it('gives Gemini the style it had, or the default when it had none', () => {
    expect(narrationForOption({ ...current, style: null }, narrator('best'), 'en', []).style).toBe(
      DEFAULT_NARRATION.style,
    );
  });
});

describe('voice and device choices', () => {
  it('changes only the voice when a voice is picked', () => {
    expect(narrationWithVoice(DEFAULT_NARRATION, 'Puck')).toMatchObject({
      provider: 'openrouter',
      voice: 'Puck',
      model: DEFAULT_NARRATION.model,
    });
  });

  it('switches to the device provider and keeps the rest', () => {
    expect(narrationForDevice(DEFAULT_NARRATION, 'en-us-x')).toMatchObject({
      provider: 'device',
      voice: 'en-us-x',
      model: DEFAULT_NARRATION.model,
    });
  });
});
