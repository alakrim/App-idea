import { MAX_SENTENCE_CHARS } from './fragments';
import { normalizeWhitespace } from './normalize';
import { resolveIntlSegmenter, segmentSentences } from './segment';

import type { SentenceSegmenterCtor } from './segment';

/** A native segmenter that splits after every period followed by a space, like an over-eager ICU. */
function overSplittingSegmenter(calls: string[]): SentenceSegmenterCtor {
  return class {
    segment(input: string): Iterable<{ segment: string }> {
      calls.push(input);
      return input.split(/(?<=\.)\s+/u).map((segment) => ({ segment }));
    }
  } as unknown as SentenceSegmenterCtor;
}

/** A native segmenter that never splits: the whole paragraph is one fragment. */
function wholeTextSegmenter(): SentenceSegmenterCtor {
  return class {
    segment(input: string): Iterable<{ segment: string }> {
      return [{ segment: input }];
    }
  } as unknown as SentenceSegmenterCtor;
}

const throwingSegmenter = class {
  constructor() {
    throw new RangeError('unsupported locale');
  }
} as unknown as SentenceSegmenterCtor;

describe('segmentSentences', () => {
  it('returns no sentences for empty or whitespace-only paragraphs', () => {
    expect(segmentSentences('')).toEqual([]);
    expect(segmentSentences(' \n\t ')).toEqual([]);
  });

  it('returns a single sentence for a heading-like paragraph without punctuation', () => {
    expect(segmentSentences('Chapter Three')).toEqual(['Chapter Three']);
  });

  it('splits a Latin paragraph and keeps abbreviations together', () => {
    expect(
      segmentSentences(
        'Mr. Hollis stood at the window of the old post office on St. Mary\'s Road. He waited for the rain to stop.',
        'en',
        { segmenter: null },
      ),
    ).toEqual([
      "Mr. Hollis stood at the window of the old post office on St. Mary's Road.",
      'He waited for the rain to stop.',
    ]);
  });

  it('normalises internal whitespace before splitting', () => {
    expect(segmentSentences('First   sentence here.\n  Second one follows now.', undefined, { segmenter: null })).toEqual([
      'First sentence here.',
      'Second one follows now.',
    ]);
  });

  it('splits a sentence longer than 400 characters at a secondary break', () => {
    const clause = 'the wind kept blowing over the empty hills; ';
    const long = `${clause.repeat(12).trim()}.`;
    expect(long.length).toBeGreaterThan(MAX_SENTENCE_CHARS);
    const pieces = segmentSentences(long, undefined, { segmenter: null });
    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.every((piece) => piece.length <= MAX_SENTENCE_CHARS)).toBe(true);
  });

  it('uses the injected native segmenter for non-CJK text, then repairs its abbreviation splits', () => {
    const calls: string[] = [];
    const sentences = segmentSentences(
      'Mr. Hollis left. He was very tired after the long trip home.',
      'en',
      { segmenter: overSplittingSegmenter(calls) },
    );
    expect(calls).toHaveLength(1);
    expect(sentences).toEqual([
      'Mr. Hollis left.',
      'He was very tired after the long trip home.',
    ]);
  });

  it('refines native output with the rule splitter, so dialogue dashes that ICU keeps are split', () => {
    const sentences = segmentSentences('— Ciao, disse lui. — Come stai oggi? Bene, grazie a tutti.', 'it', {
      segmenter: wholeTextSegmenter(),
    });
    expect(sentences).toEqual(['— Ciao, disse lui.', '— Come stai oggi?', 'Bene, grazie a tutti.']);
  });

  it('does not call the native segmenter for CJK text', () => {
    const calls: string[] = [];
    segmentSentences('雨下了整整一夜。林默站在门口。', 'zh', {
      segmenter: overSplittingSegmenter(calls),
    });
    expect(calls).toHaveLength(0);
  });

  it('falls back to the rule splitter when the native segmenter is null', () => {
    expect(
      segmentSentences('Hello there, my friend. Good morning to everyone.', undefined, { segmenter: null }),
    ).toEqual(['Hello there, my friend.', 'Good morning to everyone.']);
  });

  it('falls back to the rule splitter when the native segmenter rejects the locale', () => {
    expect(
      segmentSentences('Hello there, my friend. Good morning to everyone.', 'not a locale!!', {
        segmenter: throwingSegmenter,
      }),
    ).toEqual(['Hello there, my friend.', 'Good morning to everyone.']);
  });

  it('detects Intl.Segmenter at runtime when no segmenter option is given', () => {
    expect(typeof resolveIntlSegmenter()).toBe('function');
    expect(resolveIntlSegmenter({})).toBeNull();
    expect(
      segmentSentences('Mr. Hollis left. He was tired after the long trip.', 'en'),
    ).toEqual(['Mr. Hollis left.', 'He was tired after the long trip.']);
  });

  it('keeps the concatenation of its sentences equal to the paragraph, modulo whitespace', () => {
    const paragraphs = [
      '"You should go home," said Mrs. Hollis. "It is nearly nine o\'clock." Yes. Nothing else.',
      '「もう帰ろう。」「まだだ。」彼女は首を振った。「手紙を読んでいない。」',
      '“活下去，别回头。”老人说。林默沉默了。',
      'Dr. Pell paid 3.50 pounds, e.g. for tea; i.e. the good kind; then he left at 9 p.m. Done.',
    ];
    for (const paragraph of paragraphs) {
      for (const segmenter of [null, overSplittingSegmenter([]), undefined]) {
        const sentences = segmentSentences(paragraph, undefined, { segmenter });
        expect(sentences.join('').replace(/\s/gu, '')).toBe(paragraph.replace(/\s/gu, ''));
        expect(sentences.every((sentence) => sentence === normalizeWhitespace(sentence))).toBe(true);
        expect(sentences.every((sentence) => sentence.length > 0)).toBe(true);
      }
    }
  });
});
