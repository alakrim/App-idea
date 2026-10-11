import {
  HIGHLIGHT_MS,
  highlightStrength,
  paragraphOfSentence,
  parseSentenceParam,
} from './sentence-focus';

describe('parseSentenceParam', () => {
  it('reads a whole, non-negative sentence index from the route', () => {
    expect(parseSentenceParam('0')).toBe(0);
    expect(parseSentenceParam('41')).toBe(41);
    expect(parseSentenceParam(['7', '9'])).toBe(7);
  });

  it('treats anything else as no link', () => {
    for (const value of [undefined, '', '-1', '2.5', 'abc', '1e3', ' 4']) {
      expect(parseSentenceParam(value)).toBeNull();
    }
    expect(parseSentenceParam('99999999999999999999')).toBeNull();
  });
});

describe('paragraphOfSentence', () => {
  const paragraphs = [
    { idx: 0, sentences: [{ idx: 0 }, { idx: 1 }] },
    { idx: 1, sentences: [{ idx: 2 }] },
  ];

  it('finds the paragraph that holds the sentence', () => {
    expect(paragraphOfSentence(paragraphs, 2)).toBe(1);
    expect(paragraphOfSentence(paragraphs, 0)).toBe(0);
  });

  it('returns null for a sentence no paragraph holds', () => {
    expect(paragraphOfSentence(paragraphs, 9)).toBeNull();
  });
});

describe('highlightStrength', () => {
  it('fades linearly from full strength to none over the highlight time', () => {
    expect(highlightStrength(0, false)).toBe(1);
    expect(highlightStrength(HIGHLIGHT_MS / 2, false)).toBeCloseTo(0.5);
    expect(highlightStrength(HIGHLIGHT_MS, false)).toBe(0);
    expect(highlightStrength(HIGHLIGHT_MS + 100, false)).toBe(0);
  });

  it('holds full strength for reduced motion, then ends without a fade', () => {
    expect(highlightStrength(HIGHLIGHT_MS / 2, true)).toBe(1);
    expect(highlightStrength(HIGHLIGHT_MS - 1, true)).toBe(1);
    expect(highlightStrength(HIGHLIGHT_MS, true)).toBe(0);
  });
});
