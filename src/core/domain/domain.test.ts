import { createIdGenerator, newId } from './ids';
import { AmbienceCueSchema, ChapterSourceSchema, LangSchema, ParagraphSchema } from './index';

const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

describe('ids', () => {
  it('generates ULIDs', () => {
    expect(newId()).toMatch(ULID_PATTERN);
  });

  it('is monotonic within one millisecond and sorts by time across milliseconds', () => {
    let now = 1_700_000_000_000;
    const next = createIdGenerator({ now: () => now, prng: () => 0.5 });

    const sameMs = [next(), next(), next()];
    now += 1;
    const later = next();

    expect([...sameMs].sort()).toEqual(sameMs);
    expect(sameMs.every((id, i) => i === 0 || id > (sameMs[i - 1] ?? ''))).toBe(true);
    expect(later > (sameMs[2] ?? '')).toBe(true);
  });

  it('is deterministic when the clock and PRNG are injected', () => {
    const make = (): string =>
      createIdGenerator({ now: () => 1_700_000_000_000, prng: () => 0.25 })();

    expect(make()).toBe(make());
    expect(make()).toMatch(ULID_PATTERN);
  });
});

describe('domain schemas', () => {
  it('accepts BCP-47 tags and rejects other strings', () => {
    expect(LangSchema.safeParse('zh-Hans').success).toBe(true);
    expect(LangSchema.safeParse('pt-BR').success).toBe(true);
    expect(LangSchema.safeParse('not a language!').success).toBe(false);
  });

  it('discriminates chapter sources by kind', () => {
    expect(ChapterSourceSchema.parse({ kind: 'url', url: 'https://example.com/a' }).kind).toBe(
      'url',
    );
    expect(ChapterSourceSchema.safeParse({ kind: 'url', url: 'not a url' }).success).toBe(false);
    expect(ChapterSourceSchema.safeParse({ kind: 'carrier-pigeon' }).success).toBe(false);
  });

  it('rejects ranges that end before they start', () => {
    expect(
      ParagraphSchema.safeParse({ idx: 0, sentenceStart: 5, sentenceEnd: 2, kind: 'text' }).success,
    ).toBe(false);
    expect(
      AmbienceCueSchema.safeParse({
        id: newId(),
        chapterId: newId(),
        category: 'rain',
        startSentence: 9,
        endSentence: 3,
        intensity: 'low',
        fadeInMs: 0,
        fadeOutMs: 0,
        confidence: 0.9,
        reason: 'Rain on a window.',
        enabled: true,
      }).success,
    ).toBe(false);
  });
});
