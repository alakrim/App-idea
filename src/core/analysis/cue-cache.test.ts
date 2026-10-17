import { CachedCuesSchema, cueCacheKey } from './cue-cache';

describe('cueCacheKey', () => {
  const texts = ['Rain fell on the harbour.', 'A bell rang.'];

  it('is the same for the same text, model and prompt', () => {
    expect(cueCacheKey('analysis/model', texts)).toBe(cueCacheKey('analysis/model', [...texts]));
  });

  it('changes with the text, so an edited chapter is analysed again', () => {
    expect(cueCacheKey('analysis/model', texts)).not.toBe(
      cueCacheKey('analysis/model', ['Rain fell on the harbour.', 'A bell rang out.']),
    );
  });

  it('changes with the model, and it respects sentence order', () => {
    expect(cueCacheKey('analysis/model', texts)).not.toBe(cueCacheKey('other/model', texts));
    expect(cueCacheKey('analysis/model', texts)).not.toBe(
      cueCacheKey('analysis/model', [...texts].reverse()),
    );
  });
});

describe('CachedCuesSchema', () => {
  const valid = {
    category: 'tavern_crowd',
    startSentence: 0,
    endSentence: 4,
    intensity: 'high',
    fadeInMs: 2000,
    fadeOutMs: 2500,
    confidence: 0.6,
    reason: 'Glasses and talk.',
  };

  it('accepts validated cues and rejects a row that does not match', () => {
    expect(CachedCuesSchema.safeParse([valid]).success).toBe(true);
    expect(CachedCuesSchema.safeParse([{ ...valid, intensity: 'loud' }]).success).toBe(false);
    expect(CachedCuesSchema.safeParse([{ ...valid, confidence: 1.5 }]).success).toBe(false);
  });
});
