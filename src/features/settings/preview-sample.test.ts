import { previewCacheKey, previewSampleFor, PREVIEW_SAMPLES } from './preview-sample';

const BASE = {
  model: 'google/gemini-3.8-flash-lite-tts',
  voice: 'Kore',
  lang: 'en',
  style: 'Warm narrator.',
  speed: 1,
};

describe('preview cache key', () => {
  it('is stable for the same model, voice, language, style and speed', () => {
    expect(previewCacheKey(BASE)).toBe(previewCacheKey({ ...BASE }));
  });

  it('changes when any keyed part changes', () => {
    const key = previewCacheKey(BASE);
    expect(previewCacheKey({ ...BASE, model: 'hexgrad/kokoro-82m' })).not.toBe(key);
    expect(previewCacheKey({ ...BASE, voice: 'Puck' })).not.toBe(key);
    expect(previewCacheKey({ ...BASE, lang: 'it' })).not.toBe(key);
    expect(previewCacheKey({ ...BASE, style: null })).not.toBe(key);
    expect(previewCacheKey({ ...BASE, speed: 1.1 })).not.toBe(key);
  });

  it('is safe as a file name', () => {
    expect(previewCacheKey(BASE)).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('preview sample text', () => {
  it('uses the sample for the primary language subtag', () => {
    expect(previewSampleFor('pt-BR')).toEqual({ lang: 'pt', text: PREVIEW_SAMPLES.pt });
  });

  it('falls back to English for languages without a sample, and when nothing is set', () => {
    expect(previewSampleFor('ko')).toEqual({ lang: 'en', text: PREVIEW_SAMPLES.en });
    expect(previewSampleFor(null)).toEqual({ lang: 'en', text: PREVIEW_SAMPLES.en });
  });

  it('keeps every sample near fifteen words', () => {
    for (const text of Object.values(PREVIEW_SAMPLES)) {
      const words = text.split(/\s+/).length;
      expect(words).toBeGreaterThanOrEqual(13);
      expect(words).toBeLessThanOrEqual(17);
    }
  });
});
