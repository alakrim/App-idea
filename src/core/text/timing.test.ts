import { estimateSentenceOffsets, sentenceAt } from './timing';

describe('estimateSentenceOffsets', () => {
  it('returns no offsets for no sentences', () => {
    expect(estimateSentenceOffsets([], 1000)).toEqual([]);
  });

  it('starts at zero and never decreases', () => {
    const texts = ['One.', 'A much longer second sentence, with a comma.', 'Three!', 'Four?'];
    const offsets = estimateSentenceOffsets(texts, 12_000);
    expect(offsets[0]).toBe(0);
    for (let i = 1; i < offsets.length; i += 1) {
      expect(offsets[i]).toBeGreaterThanOrEqual(offsets[i - 1] ?? 0);
    }
  });

  it('keeps every offset below the total duration', () => {
    const texts = Array.from({ length: 50 }, (_, i) => `Sentence number ${i}.`);
    const total = 3000;
    for (const offset of estimateSentenceOffsets(texts, total)) {
      expect(offset).toBeLessThan(total);
      expect(offset).toBeGreaterThanOrEqual(0);
    }
  });

  it('gives longer sentences a longer share of the time', () => {
    const offsets = estimateSentenceOffsets(['Hi.', 'This sentence is much, much longer than the first.'], 10_000);
    const firstShare = (offsets[1] ?? 0) - (offsets[0] ?? 0);
    expect(firstShare).toBeLessThan(10_000 / 2);
  });

  it('adds a pause for terminal punctuation', () => {
    const plain = estimateSentenceOffsets(['abcdef', 'ghijkl'], 1000);
    const punctuated = estimateSentenceOffsets(['abcdef.', 'ghijkl'], 1000);
    expect(punctuated[1]).toBeGreaterThan(plain[1] ?? 0);
  });

  it('adds a smaller pause for commas than for terminal punctuation', () => {
    // Same letters in both: the comma pause is 3 character equivalents, the terminal one 8.
    const comma = estimateSentenceOffsets(['abcdef, ghi', 'jkl'], 1000)[1] ?? 0;
    const terminal = estimateSentenceOffsets(['abcdef ghi.', 'jkl'], 1000)[1] ?? 0;
    expect(terminal).toBeGreaterThan(comma);
  });

  it('weights CJK sentences by their characters, ignoring spaces', () => {
    const offsets = estimateSentenceOffsets(['雨下了整整一夜。', '林默站在破庙的门口，看着远处。'], 1000);
    // 8 characters in the first sentence, 15 in the second (punctuation counts as a character).
    expect(offsets[1]).toBe(Math.floor((1000 * 8) / (8 + 15)));
  });

  it('spreads offsets across the whole duration for equal sentences', () => {
    const offsets = estimateSentenceOffsets(['abcd.', 'abcd.', 'abcd.', 'abcd.'], 4000);
    expect(offsets).toEqual([0, 1000, 2000, 3000]);
  });

  it('never gives an empty sentence zero weight', () => {
    const offsets = estimateSentenceOffsets(['...', '...'], 100);
    expect(offsets[1]).toBeGreaterThan(0);
  });

  it('rejects a duration below one millisecond', () => {
    expect(() => estimateSentenceOffsets(['x.'], 0)).toThrow(RangeError);
    expect(() => estimateSentenceOffsets(['x.'], Number.NaN)).toThrow(RangeError);
  });
});

describe('sentenceAt', () => {
  const offsets = [0, 1000, 1000, 2500, 4000];

  it('returns -1 for an empty list', () => {
    expect(sentenceAt([], 500)).toBe(-1);
  });

  it('returns the sentence whose offset is at or before the position', () => {
    expect(sentenceAt(offsets, 0)).toBe(0);
    expect(sentenceAt(offsets, 999)).toBe(0);
    expect(sentenceAt(offsets, 2499)).toBe(2);
    expect(sentenceAt(offsets, 2500)).toBe(3);
  });

  it('returns the last of several sentences that share an offset', () => {
    expect(sentenceAt(offsets, 1000)).toBe(2);
  });

  it('returns the last sentence for a position past the end', () => {
    expect(sentenceAt(offsets, 999_999)).toBe(4);
  });

  it('returns the first sentence for a negative position', () => {
    expect(sentenceAt(offsets, -5)).toBe(0);
  });
});
