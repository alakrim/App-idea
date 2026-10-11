import { MAX_SENTENCE_CHARS, mergeShortFragments, repairNativeFragments, splitLongSentence } from './fragments';

describe('mergeShortFragments', () => {
  it('attaches a Latin fragment of fewer than three words to the previous sentence', () => {
    expect(mergeShortFragments(['The rain fell.', 'Yes.', 'Then it stopped.'])).toEqual([
      'The rain fell. Yes.',
      'Then it stopped.',
    ]);
  });

  it('attaches a leading short fragment to the next sentence', () => {
    expect(mergeShortFragments(['Yes.', 'The rain fell.'])).toEqual(['Yes. The rain fell.']);
  });

  it('leaves fragments of three or more words alone', () => {
    expect(mergeShortFragments(['One two three.', 'Three four five.'])).toEqual([
      'One two three.',
      'Three four five.',
    ]);
  });

  it('attaches a CJK fragment of fewer than two characters without a space', () => {
    expect(mergeShortFragments(['本須は言った。', '一。', 'そして歩き出した。'])).toEqual([
      '本須は言った。一。',
      'そして歩き出した。',
    ]);
  });

  it('uses the word rule for Hangul, which is word-spaced', () => {
    expect(mergeShortFragments(['그는 떠났다.', '기다려 줘.', '그녀는 조용히 남았다.'])).toEqual([
      '그는 떠났다. 기다려 줘.',
      '그녀는 조용히 남았다.',
    ]);
  });

  it('keeps every character in order', () => {
    const input = ['A b.', 'C d e f.', 'Yes.', 'Long enough sentence here.', 'No.'];
    const merged = mergeShortFragments(input);
    expect(merged.join(' ')).toBe(input.join(' '));
  });

  it('returns an empty array for no fragments', () => {
    expect(mergeShortFragments([])).toEqual([]);
  });
});

describe('repairNativeFragments', () => {
  it('joins an abbreviation split off by a native segmenter to the following fragment', () => {
    expect(repairNativeFragments(['Mr.', 'Hollis left.', 'He waited.'])).toEqual([
      'Mr. Hollis left.',
      'He waited.',
    ]);
  });

  it('joins an initial and an acronym', () => {
    expect(repairNativeFragments(['J.', 'K. Rowling wrote.', 'The U.', 'S. army left.'])).toEqual([
      'J. K. Rowling wrote.',
      'The U. S. army left.',
    ]);
  });

  it('keeps sentence-ending periods as boundaries', () => {
    expect(repairNativeFragments(['It was late.', 'Then it rained.'])).toEqual([
      'It was late.',
      'Then it rained.',
    ]);
  });
});

describe('splitLongSentence', () => {
  it('returns short sentences unchanged', () => {
    expect(splitLongSentence('A short sentence.')).toEqual(['A short sentence.']);
  });

  it('returns no pieces for empty or whitespace-only input', () => {
    expect(splitLongSentence('   ')).toEqual([]);
  });

  it('splits an overlong sentence at a semicolon, keeping pieces within the limit', () => {
    const part = 'word '.repeat(60).trim();
    const long = `${part}; ${part}; ${part}`;
    const pieces = splitLongSentence(long);
    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.every((piece) => piece.length <= MAX_SENTENCE_CHARS)).toBe(true);
    expect(pieces[0]?.endsWith(';')).toBe(true);
    expect(pieces.join(' ')).toBe(long);
  });

  it('prefers a comma over a plain space when both are available', () => {
    const filler = 'alpha '.repeat(50).trim();
    const text = `${filler}, ${filler} ${filler}`;
    const pieces = splitLongSentence(text, 300);
    expect(pieces[0]?.endsWith(',')).toBe(true);
  });

  it('splits CJK text at the ideographic comma', () => {
    const clause = '雨下了整整一夜，';
    const text = clause.repeat(60);
    const pieces = splitLongSentence(text);
    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.every((piece) => piece.length <= MAX_SENTENCE_CHARS)).toBe(true);
    expect(pieces.join('')).toBe(text);
  });

  it('hard-cuts text with no break without splitting a surrogate pair', () => {
    const text = '🎧'.repeat(250);
    const pieces = splitLongSentence(text, 401);
    expect(pieces.length).toBeGreaterThan(1);
    for (const piece of pieces) {
      expect(piece).toMatch(/^(?:\p{Extended_Pictographic})*$/u);
    }
    expect(pieces.join('')).toBe(text);
  });

  it('respects a custom maximum', () => {
    const pieces = splitLongSentence('one two three four five six seven eight nine ten', 20);
    expect(pieces.every((piece) => piece.length <= 20)).toBe(true);
    expect(pieces.join(' ')).toBe('one two three four five six seven eight nine ten');
  });
});
