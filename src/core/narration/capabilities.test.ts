import { isFishModel, isNarratableModel, supportsStyleInstructions } from './capabilities';

describe('isNarratableModel', () => {
  it('accepts any model whose output is speech, with or without voices', () => {
    expect(isNarratableModel({ id: 'fish-audio/drama-3', outputModalities: ['speech'] })).toBe(
      true,
    );
    expect(isNarratableModel({ id: 'hexgrad/kokoro-82m', outputModalities: ['speech'] })).toBe(
      true,
    );
  });

  it('refuses Seed Audio, which treats the input as a prompt', () => {
    expect(
      isNarratableModel({ id: 'bytedance-seed/seed-audio-1-0', outputModalities: ['speech'] }),
    ).toBe(false);
  });

  it('refuses a model that does not output speech', () => {
    expect(
      isNarratableModel({ id: 'anthropic/claude-haiku-5.5', outputModalities: ['text'] }),
    ).toBe(false);
  });
});

describe('supportsStyleInstructions', () => {
  it('is true for Gemini TTS, gpt-4o-mini-tts and every Fish Audio model', () => {
    expect(supportsStyleInstructions({ id: 'google/gemini-3.8-flash-lite-tts' })).toBe(true);
    expect(supportsStyleInstructions({ id: 'openai/gpt-4o-mini-tts' })).toBe(true);
    expect(supportsStyleInstructions({ id: 'fish-audio/drama-3' })).toBe(true);
    expect(supportsStyleInstructions({ id: 'fish-audio/s2.1-pro-free:free' })).toBe(true);
  });

  it('is true for a model that lists the instructions parameter', () => {
    expect(
      supportsStyleInstructions({ id: 'vendor/voice', supportedParameters: ['instructions'] }),
    ).toBe(true);
  });

  it('is false for Kokoro, a Gemini model that is not TTS, and a model with no parameters', () => {
    expect(supportsStyleInstructions({ id: 'hexgrad/kokoro-82m', supportedParameters: [] })).toBe(
      false,
    );
    expect(supportsStyleInstructions({ id: 'google/gemini-flash', supportedParameters: [] })).toBe(
      false,
    );
    expect(supportsStyleInstructions({ id: 'canopylabs/orpheus-3b-0.1-ft' })).toBe(false);
  });
});

describe('isFishModel', () => {
  it('matches the fish-audio namespace only', () => {
    expect(isFishModel('fish-audio/s1')).toBe(true);
    expect(isFishModel('fish-audio/s2.1-pro-free:free')).toBe(true);
    expect(isFishModel('hexgrad/kokoro-82m')).toBe(false);
  });
});
