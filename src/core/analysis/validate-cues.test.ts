import { CUE_LIMITS } from './limits';
import { sentences } from './__fixtures__/builders';
import { FADES_BY_INTENSITY, validateCues } from './validate-cues';
import type { CueValidationContext } from './validate-cues';

/** 40 sentences of 80 characters: a 4-sentence cue is 320 chars, about 21 s, so it passes. */
const SENTENCES = sentences(40, 80);

function ctx(overrides: Partial<CueValidationContext> = {}): CueValidationContext {
  return { sentenceCount: 40, wordCount: 10_000, sentences: SENTENCES, ...overrides };
}

function cue(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    category: 'light_rain',
    startSentence: 2,
    endSentence: 5,
    intensity: 'medium',
    confidence: 0.9,
    reason: 'Rain hammers the roof.',
    ...overrides,
  };
}

describe('validateCues: rule by rule', () => {
  it('keeps a well-formed cue and attaches fades by intensity', () => {
    const { cues, dropped } = validateCues([cue()], ctx());
    expect(dropped).toEqual([]);
    expect(cues).toEqual([
      {
        category: 'light_rain',
        startSentence: 2,
        endSentence: 5,
        intensity: 'medium',
        fadeInMs: FADES_BY_INTENSITY.medium.fadeInMs,
        fadeOutMs: FADES_BY_INTENSITY.medium.fadeOutMs,
        confidence: 0.9,
        reason: 'Rain hammers the roof.',
      },
    ]);
  });

  it('gives each intensity its own default fades', () => {
    const { cues } = validateCues(
      [cue({ startSentence: 0, endSentence: 3, intensity: 'low' }), cue({ startSentence: 10, endSentence: 13, intensity: 'high' })],
      ctx(),
    );
    expect(cues.find((c) => c.intensity === 'low')).toMatchObject(FADES_BY_INTENSITY.low);
    expect(cues.find((c) => c.intensity === 'high')).toMatchObject(FADES_BY_INTENSITY.high);
  });

  it('defaults a missing intensity to medium and a missing reason to empty', () => {
    const { cues } = validateCues([cue({ intensity: undefined, reason: undefined })], ctx());
    expect(cues[0]).toMatchObject({ intensity: 'medium', reason: '' });
  });

  it('drops malformed cues with reason malformed', () => {
    const bad = [{ category: 'light_rain' }, 'not an object', cue({ confidence: 'high' })];
    const { cues, dropped } = validateCues(bad, ctx());
    expect(cues).toEqual([]);
    expect(dropped.map((d) => d.reason)).toEqual(['malformed', 'malformed', 'malformed']);
  });

  it('drops unknown categories', () => {
    const { dropped } = validateCues([cue({ category: 'dragon_roar' })], ctx());
    expect(dropped).toEqual([{ cue: expect.anything(), reason: 'unknown_category' }]);
  });

  it('drops oneshot categories in v1', () => {
    const { cues, dropped } = validateCues([cue({ category: 'gunshot' })], ctx());
    expect(cues).toEqual([]);
    expect(dropped[0]?.reason).toBe('category_not_enabled');
  });

  it('drops confidence below 0.55 and keeps exactly 0.55', () => {
    const low = validateCues([cue({ confidence: 0.54 })], ctx());
    expect(low.dropped[0]?.reason).toBe('low_confidence');
    const edge = validateCues([cue({ confidence: CUE_LIMITS.confidenceFloor })], ctx());
    expect(edge.cues).toHaveLength(1);
  });

  it('clamps confidence into 0..1', () => {
    const { cues } = validateCues([cue({ confidence: 1.7 })], ctx());
    expect(cues[0]?.confidence).toBe(1);
  });

  it('drops a span that is empty after clamping, such as start after end', () => {
    const { dropped } = validateCues([cue({ startSentence: 9, endSentence: 4 })], ctx());
    expect(dropped[0]?.reason).toBe('invalid_span');
  });

  it('clamps indices into the chapter', () => {
    const { cues } = validateCues([cue({ startSentence: -3, endSentence: 999 })], ctx({ sentenceCount: 10 }));
    expect(cues[0]).toMatchObject({ startSentence: 0, endSentence: 9 });
  });

  it('rounds fractional indices', () => {
    const { cues } = validateCues([cue({ startSentence: 2.4, endSentence: 5.6 })], ctx());
    expect(cues[0]).toMatchObject({ startSentence: 2, endSentence: 6 });
  });

  it('drops cues shorter than 3 sentences', () => {
    const { dropped } = validateCues([cue({ startSentence: 2, endSentence: 3 })], ctx());
    expect(dropped[0]?.reason).toBe('too_short');
  });

  it('drops cues under 20 seconds at 15 characters per second', () => {
    const short = sentences(40, 20);
    const { dropped } = validateCues([cue({ startSentence: 0, endSentence: 2 })], ctx({ sentences: short }));
    // 3 * 20 = 60 chars, which is 4 s at 15 chars/s.
    expect(dropped[0]?.reason).toBe('too_short');
  });

  it('merges same-category cues separated by at most 2 sentences and keeps the stronger confidence', () => {
    const { cues, dropped } = validateCues(
      [
        cue({ startSentence: 2, endSentence: 5, confidence: 0.6, reason: 'first' }),
        cue({ startSentence: 8, endSentence: 11, confidence: 0.9, reason: 'second' }),
      ],
      ctx(),
    );
    expect(cues).toHaveLength(1);
    expect(cues[0]).toMatchObject({ startSentence: 2, endSentence: 11, confidence: 0.9, reason: 'second' });
    expect(dropped.map((d) => d.reason)).toEqual(['merged']);
  });

  it('does not merge same-category cues separated by 3 or more sentences', () => {
    const { cues } = validateCues(
      [cue({ startSentence: 2, endSentence: 5 }), cue({ startSentence: 9, endSentence: 12 })],
      ctx(),
    );
    expect(cues).toHaveLength(2);
  });

  it('never merges different categories', () => {
    const { cues } = validateCues(
      [cue({ startSentence: 2, endSentence: 5 }), cue({ category: 'city_night', startSentence: 6, endSentence: 9 })],
      ctx(),
    );
    expect(cues).toHaveLength(2);
  });

  it('caps density at 2 per 1,000 words and keeps the highest confidence', () => {
    const three = [
      cue({ startSentence: 0, endSentence: 4, confidence: 0.6, category: 'light_rain' }),
      cue({ startSentence: 10, endSentence: 14, confidence: 0.95, category: 'city_night' }),
      cue({ startSentence: 20, endSentence: 24, confidence: 0.8, category: 'tavern_crowd' }),
    ];
    const { cues, dropped } = validateCues(three, ctx({ wordCount: 1000 }));
    expect(cues.map((c) => c.category)).toEqual(['city_night', 'tavern_crowd']);
    expect(dropped).toEqual([expect.objectContaining({ reason: 'density_cap' })]);
  });

  it('allows no cues in a chapter under 500 words', () => {
    const { cues, dropped } = validateCues([cue()], ctx({ wordCount: 499 }));
    expect(cues).toEqual([]);
    expect(dropped[0]?.reason).toBe('density_cap');
  });

  it('allows at most two overlapping beds at any sentence', () => {
    const { cues, dropped } = validateCues(
      [
        cue({ category: 'light_rain', startSentence: 0, endSentence: 5, confidence: 0.9 }),
        cue({ category: 'city_night', startSentence: 0, endSentence: 5, confidence: 0.8 }),
        cue({ category: 'tavern_crowd', startSentence: 3, endSentence: 8, confidence: 0.7 }),
      ],
      ctx(),
    );
    expect(cues.map((c) => c.category).sort()).toEqual(['city_night', 'light_rain']);
    expect(dropped).toEqual([expect.objectContaining({ reason: 'overlap_limit' })]);
  });

  it('returns cues sorted by start sentence', () => {
    const { cues } = validateCues(
      [
        cue({ category: 'city_night', startSentence: 20, endSentence: 24 }),
        cue({ category: 'light_rain', startSentence: 0, endSentence: 4 }),
      ],
      ctx(),
    );
    expect(cues.map((c) => c.startSentence)).toEqual([0, 20]);
  });

  it('truncates the reason to 80 characters', () => {
    const { cues } = validateCues([cue({ reason: 'r'.repeat(200) })], ctx());
    expect(cues[0]?.reason).toHaveLength(CUE_LIMITS.reasonChars);
  });

  it('returns nothing for an empty chapter', () => {
    const { cues, dropped } = validateCues([cue()], ctx({ sentenceCount: 0, sentences: [] }));
    expect(cues).toEqual([]);
    expect(dropped[0]?.reason).toBe('invalid_span');
  });
});
