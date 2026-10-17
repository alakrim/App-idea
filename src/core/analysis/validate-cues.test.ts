import { sentences } from './__fixtures__/builders';
import { CUE_LIMITS } from './limits';
import { FADES_BY_INTENSITY, maxCuesForWordCount, validateCues } from './validate-cues';
import { SPEECH_CHARS_PER_SECOND } from '../text/speech-rate';

import type { CueValidationContext } from './validate-cues';

/** 40 sentences of 80 characters: a 4-sentence cue is well over the minimum span, so it passes. */
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
      [
        cue({ startSentence: 0, endSentence: 3, intensity: 'low' }),
        cue({ startSentence: 10, endSentence: 13, intensity: 'high' }),
      ],
      ctx(),
    );
    expect(cues.find((c) => c.intensity === 'low')).toMatchObject(FADES_BY_INTENSITY.low);
    expect(cues.find((c) => c.intensity === 'high')).toMatchObject(FADES_BY_INTENSITY.high);
  });

  it('defaults a null intensity to medium and a null reason to empty', () => {
    const { cues } = validateCues([cue({ intensity: null, reason: null })], ctx());
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

  it('drops confidence below 0.45 and keeps exactly 0.45', () => {
    const low = validateCues([cue({ confidence: 0.44 })], ctx());
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
    const { cues } = validateCues(
      [cue({ startSentence: -3, endSentence: 999 })],
      ctx({ sentenceCount: 10 }),
    );
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

  it('drops a 3-sentence cue under the minimum span', () => {
    const short = sentences(40, 20);
    const { dropped } = validateCues(
      [cue({ startSentence: 0, endSentence: 2 })],
      ctx({ sentences: short }),
    );
    // Three sentences of about 19 letters each are well under CUE_LIMITS.minSeconds at the Latin rate.
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
    expect(cues[0]).toMatchObject({
      startSentence: 2,
      endSentence: 11,
      confidence: 0.9,
      reason: 'second',
    });
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
      [
        cue({ startSentence: 2, endSentence: 5 }),
        cue({ category: 'city_night', startSentence: 6, endSentence: 9 }),
      ],
      ctx(),
    );
    expect(cues).toHaveLength(2);
  });

  it('caps density at 3 per 1,000 words and keeps the highest confidence', () => {
    const four = [
      cue({ startSentence: 0, endSentence: 4, confidence: 0.6, category: 'light_rain' }),
      cue({ startSentence: 10, endSentence: 14, confidence: 0.95, category: 'city_night' }),
      cue({ startSentence: 20, endSentence: 24, confidence: 0.8, category: 'tavern_crowd' }),
      cue({ startSentence: 30, endSentence: 34, confidence: 0.9, category: 'forest_night' }),
    ];
    const { cues, dropped } = validateCues(four, ctx({ wordCount: 1000 }));
    expect(cues.map((c) => c.category)).toEqual(['city_night', 'tavern_crowd', 'forest_night']);
    expect(dropped).toEqual([expect.objectContaining({ reason: 'density_cap' })]);
  });

  it('allows no cues in a chapter under 200 words', () => {
    const { cues, dropped } = validateCues([cue()], ctx({ wordCount: 199 }));
    expect(cues).toEqual([]);
    expect(dropped[0]?.reason).toBe('density_cap');
  });

  it('allows one cue from 200 words, even though 3 per 1,000 words rounds down to zero', () => {
    const two = [
      cue({ startSentence: 0, endSentence: 4, confidence: 0.6, category: 'light_rain' }),
      cue({ startSentence: 10, endSentence: 14, confidence: 0.9, category: 'city_night' }),
    ];
    const { cues, dropped } = validateCues(two, ctx({ wordCount: 200 }));
    expect(cues.map((c) => c.category)).toEqual(['city_night']);
    expect(dropped).toEqual([expect.objectContaining({ reason: 'density_cap' })]);
  });

  it('computes the cue cap from the word count', () => {
    expect(maxCuesForWordCount(0)).toBe(0);
    expect(maxCuesForWordCount(199)).toBe(0);
    expect(maxCuesForWordCount(200)).toBe(1);
    expect(maxCuesForWordCount(333)).toBe(1);
    expect(maxCuesForWordCount(334)).toBe(1);
    expect(maxCuesForWordCount(499)).toBe(1);
    expect(maxCuesForWordCount(500)).toBe(1);
    expect(maxCuesForWordCount(999)).toBe(2);
    expect(maxCuesForWordCount(1000)).toBe(3);
    expect(maxCuesForWordCount(2500)).toBe(7);
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

describe('validateCues: minimum span by script (text/speech-rate)', () => {
  /** Mandarin sentences of `hanPerSentence` characters each, numbered from 0. */
  const mandarin = (count: number, hanPerSentence: number) =>
    Array.from({ length: count }, (_, idx) => ({
      idx,
      text: `${'雨'.repeat(hanPerSentence)}。`,
    }));

  /** Han characters per sentence for a 4-sentence cue lasting `seconds` at the Han rate, rounded down. */
  const hanPerSentenceFor = (seconds: number): number =>
    Math.floor((seconds * SPEECH_CHARS_PER_SECOND.han) / 4);

  it('keeps a 4-sentence Mandarin cue of twice the minimum span', () => {
    // Twice the minimum at the Han rate. The hour convention (15 characters a second) would drop it.
    const { cues, dropped } = validateCues(
      [cue({ startSentence: 0, endSentence: 3 })],
      ctx({
        sentenceCount: 4,
        sentences: mandarin(4, hanPerSentenceFor(2 * CUE_LIMITS.minSeconds)),
        wordCount: 1_000,
      }),
    );
    expect(dropped).toEqual([]);
    expect(cues).toHaveLength(1);
  });

  it('still drops a short Mandarin cue under the minimum span', () => {
    // Half the minimum at the Han rate.
    const { dropped } = validateCues(
      [cue({ startSentence: 0, endSentence: 3 })],
      ctx({
        sentenceCount: 4,
        sentences: mandarin(4, hanPerSentenceFor(CUE_LIMITS.minSeconds / 2)),
        wordCount: 1_000,
      }),
    );
    expect(dropped.map((d) => d.reason)).toEqual(['too_short']);
  });

  it('keeps respecting the minimum for an English three-sentence cue', () => {
    const english = (letters: number) =>
      Array.from({ length: 3 }, (_, idx) => ({
        idx,
        text: `${'a'.repeat(letters)}.`,
      }));
    /** Letters per sentence for a 3-sentence cue lasting `seconds` at the Latin rate. */
    const lettersPerSentenceFor = (seconds: number): number =>
      Math.round((seconds * SPEECH_CHARS_PER_SECOND.latin) / 3);

    // Half the minimum span: too short.
    expect(
      validateCues(
        [cue({ startSentence: 0, endSentence: 2 })],
        ctx({
          sentenceCount: 3,
          sentences: english(lettersPerSentenceFor(CUE_LIMITS.minSeconds / 2)),
          wordCount: 1_000,
        }),
      ).dropped.map((d) => d.reason),
    ).toEqual(['too_short']);
    // Twice the minimum span: long enough.
    expect(
      validateCues(
        [cue({ startSentence: 0, endSentence: 2 })],
        ctx({
          sentenceCount: 3,
          sentences: english(lettersPerSentenceFor(2 * CUE_LIMITS.minSeconds)),
          wordCount: 1_000,
        }),
      ).cues,
    ).toHaveLength(1);
  });

  it('keeps the 70-character Mandarin rain cue from the live test', () => {
    // Sentences 1-4 of the live-test chapter: 66 Han characters, about 26 s at the Han rate.
    const live = [
      '雨从傍晚开始下，一直没有停。',
      '林默翻身上马，沿着山道向北疾驰，马蹄踏碎了路上的积水。',
      '雨点打在他的斗笠上，噼啪作响。',
      '远处的山林在雨幕中只剩下模糊的轮廓。',
    ].map((text, idx) => ({ idx, text }));
    const { cues, dropped } = validateCues(
      [cue({ startSentence: 0, endSentence: 3 })],
      ctx({ sentenceCount: 4, sentences: live, wordCount: 1_000 }),
    );
    expect(dropped).toEqual([]);
    expect(cues).toHaveLength(1);
  });
});

describe('validateCues: chapter era (A4)', () => {
  it('drops a cue whose category era conflicts with the chapter era', () => {
    const { cues, dropped } = validateCues(
      [cue({ category: 'city_street_day' })],
      ctx({ chapterEra: 'historic' }),
    );
    expect(cues).toEqual([]);
    expect(dropped.map((d) => d.reason)).toEqual(['era_conflict']);
  });

  it('keeps a timeless cue in every chapter era', () => {
    for (const era of ['timeless', 'historic', 'modern', 'futuristic'] as const) {
      const { cues } = validateCues([cue({ category: 'thunderstorm' })], ctx({ chapterEra: era }));
      expect({ era, kept: cues.length }).toEqual({ era, kept: 1 });
    }
  });

  it('keeps a historic village cue in a historic chapter, and drops a modern street cue there', () => {
    const { cues, dropped } = validateCues(
      [cue({ category: 'village_square', startSentence: 0, endSentence: 3 }), cue({ category: 'city_street_day', startSentence: 10, endSentence: 13 })],
      ctx({ chapterEra: 'historic' }),
    );
    expect(cues.map((c) => c.category)).toEqual(['village_square']);
    expect(dropped.map((d) => d.reason)).toEqual(['era_conflict']);
  });

  it('keeps every cue when the chapter era is unknown', () => {
    const { cues, dropped } = validateCues([cue({ category: 'city_street_day' })], ctx({ chapterEra: null }));
    expect(dropped).toEqual([]);
    expect(cues).toHaveLength(1);
  });
});

