import { buildChapterText } from './build';
import { estimateTokens, planLlmChunks, planTtsSegments } from './chunk';
import { estimateSpeechSeconds } from './speech-rate';

import type { TtsPlanInput } from './chunk';
import type { ParagraphKind } from './paragraphs';

/** Builds plan input directly, so a test controls every paragraph length and kind. */
function plan(paragraphs: { kind: ParagraphKind; sentences: number[] }[]): TtsPlanInput[] {
  const out: TtsPlanInput[] = [];
  paragraphs.forEach((paragraph, paragraphIdx) => {
    for (const charCount of paragraph.sentences) {
      out.push({ idx: out.length, paragraphIdx, kind: paragraph.kind, charCount });
    }
  });
  return out;
}

describe('planTtsSegments', () => {
  it('returns no segments for no sentences', () => {
    expect(planTtsSegments([])).toEqual([]);
  });

  it('fills segments greedily up to maxChars within a paragraph', () => {
    const sentences = plan([{ kind: 'text', sentences: [200, 200, 200, 200] }]);
    expect(planTtsSegments(sentences, { maxChars: 500, minChars: 0 })).toEqual([
      { sentenceStart: 0, sentenceEnd: 1 },
      { sentenceStart: 2, sentenceEnd: 3 },
    ]);
  });

  it('never exceeds maxChars for a segment of several sentences', () => {
    const sentences = plan([{ kind: 'text', sentences: [150, 150, 150, 150, 150] }]);
    const segments = planTtsSegments(sentences, { maxChars: 400, minChars: 0 });
    for (const segment of segments) {
      let chars = 0;
      for (let i = segment.sentenceStart; i <= segment.sentenceEnd; i += 1) {
        chars += sentences[i]?.charCount ?? 0;
      }
      expect(chars).toBeLessThanOrEqual(400);
    }
  });

  it('gives each heading its own segment', () => {
    const sentences = plan([
      { kind: 'heading', sentences: [12] },
      { kind: 'text', sentences: [80, 80] },
    ]);
    expect(planTtsSegments(sentences)).toEqual([
      { sentenceStart: 0, sentenceEnd: 0 },
      { sentenceStart: 1, sentenceEnd: 2 },
    ]);
  });

  it('gives a single sentence longer than maxChars its own segment', () => {
    const sentences = plan([
      { kind: 'text', sentences: [40] },
      { kind: 'text', sentences: [900] },
      { kind: 'text', sentences: [40] },
    ]);
    expect(planTtsSegments(sentences, { maxChars: 600, minChars: 0 })).toEqual([
      { sentenceStart: 0, sentenceEnd: 0 },
      { sentenceStart: 1, sentenceEnd: 1 },
      { sentenceStart: 2, sentenceEnd: 2 },
    ]);
  });

  it('does not cross a paragraph boundary when the paragraph is long enough', () => {
    const sentences = plan([
      { kind: 'text', sentences: [200] },
      { kind: 'text', sentences: [200] },
    ]);
    expect(planTtsSegments(sentences, { maxChars: 600, minChars: 120 })).toEqual([
      { sentenceStart: 0, sentenceEnd: 0 },
      { sentenceStart: 1, sentenceEnd: 1 },
    ]);
  });

  it('lets a tiny paragraph continue into a following text paragraph', () => {
    const sentences = plan([
      { kind: 'text', sentences: [40] },
      { kind: 'text', sentences: [200] },
    ]);
    expect(planTtsSegments(sentences, { maxChars: 600, minChars: 120 })).toEqual([
      { sentenceStart: 0, sentenceEnd: 1 },
    ]);
  });

  it('does not let a tiny paragraph continue into dialogue', () => {
    const sentences = plan([
      { kind: 'text', sentences: [40] },
      { kind: 'dialogue', sentences: [60] },
    ]);
    expect(planTtsSegments(sentences, { maxChars: 600, minChars: 120 })).toEqual([
      { sentenceStart: 0, sentenceEnd: 0 },
      { sentenceStart: 1, sentenceEnd: 1 },
    ]);
  });

  it('does not join a tiny paragraph when the joined segment would exceed maxChars', () => {
    const sentences = plan([
      { kind: 'text', sentences: [50] },
      { kind: 'text', sentences: [100] },
    ]);
    expect(planTtsSegments(sentences, { maxChars: 120, minChars: 120 })).toEqual([
      { sentenceStart: 0, sentenceEnd: 0 },
      { sentenceStart: 1, sentenceEnd: 1 },
    ]);
  });

  it('covers every sentence exactly once, in order, for a real chapter', () => {
    const { sentences } = buildChapterText(
      'Chapter 1\n\nThe rain fell. It fell all night long over the hills.\n\nYes.\n\n“Go now,” she said. He went.\n\nThe end.',
      'en',
      { segmenter: null },
    );
    const segments = planTtsSegments(sentences, { maxChars: 120, minChars: 40 });
    const covered = segments.flatMap((segment) => {
      const range: number[] = [];
      for (let i = segment.sentenceStart; i <= segment.sentenceEnd; i += 1) range.push(i);
      return range;
    });
    expect(covered).toEqual(sentences.map((sentence) => sentence.idx));
    for (const segment of segments)
      expect(segment.sentenceStart).toBeLessThanOrEqual(segment.sentenceEnd);
  });

  it('rejects a non-positive maxChars and a negative minChars', () => {
    expect(() => planTtsSegments([], { maxChars: 0 })).toThrow(RangeError);
    expect(() => planTtsSegments([], { minChars: -1 })).toThrow(RangeError);
  });
});

describe('estimateTokens', () => {
  it('returns zero for empty text', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('estimates about four Latin characters per token', () => {
    expect(estimateTokens('abcdefgh')).toBe(2);
    expect(estimateTokens('abcdefghi')).toBe(3);
  });

  it('estimates one token per CJK character', () => {
    expect(estimateTokens('雨下了整整一夜。')).toBe(8);
  });

  it('estimates about three characters per token for other scripts', () => {
    expect(estimateTokens('Привет мир')).toBe(4);
  });
});

describe('planLlmChunks', () => {
  const words = (count: number, word = 'abcd'): { idx: number; text: string }[] =>
    Array.from({ length: count }, (_, idx) => ({ idx, text: word }));

  it('returns no chunks for no sentences', () => {
    expect(planLlmChunks([], { maxTokens: 10, overlapSentences: 0 })).toEqual([]);
  });

  it('keeps every chunk within the token budget when sentences fit', () => {
    const sentences = words(10); // one token each
    const chunks = planLlmChunks(sentences, { maxTokens: 4, overlapSentences: 0 });
    expect(chunks).toEqual([
      { start: 0, end: 3 },
      { start: 4, end: 7 },
      { start: 8, end: 9 },
    ]);
  });

  it('shares the configured number of sentences between consecutive chunks', () => {
    const sentences = words(10);
    const chunks = planLlmChunks(sentences, { maxTokens: 4, overlapSentences: 1 });
    expect(chunks[0]).toEqual({ start: 0, end: 3 });
    expect(chunks[1]).toEqual({ start: 3, end: 6 });
    expect(chunks[chunks.length - 1]?.end).toBe(9);
  });

  it('gives a single oversized sentence its own chunk', () => {
    const sentences = [
      { idx: 0, text: 'abcd' },
      { idx: 1, text: 'x'.repeat(400) },
      { idx: 2, text: 'abcd' },
    ];
    expect(planLlmChunks(sentences, { maxTokens: 10, overlapSentences: 0 })).toEqual([
      { start: 0, end: 0 },
      { start: 1, end: 1 },
      { start: 2, end: 2 },
    ]);
  });

  it('always makes progress, even with an overlap as large as the chunk', () => {
    const chunks = planLlmChunks(words(6), { maxTokens: 2, overlapSentences: 5 });
    const starts = chunks.map((chunk) => chunk.start);
    expect(new Set(starts).size).toBe(starts.length);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(chunks[chunks.length - 1]?.end).toBe(5);
  });

  it('uses sentence idx values for its ranges', () => {
    const sentences = [
      { idx: 10, text: 'abcd' },
      { idx: 11, text: 'abcd' },
    ];
    expect(planLlmChunks(sentences, { maxTokens: 1, overlapSentences: 0 })).toEqual([
      { start: 10, end: 10 },
      { start: 11, end: 11 },
    ]);
  });

  it('rejects an invalid budget or overlap', () => {
    expect(() => planLlmChunks(words(2), { maxTokens: 0, overlapSentences: 0 })).toThrow(
      RangeError,
    );
    expect(() => planLlmChunks(words(2), { maxTokens: 5, overlapSentences: -1 })).toThrow(
      RangeError,
    );
  });
});

/** Text sentences of one paragraph, each with its own speech time. */
function timed(seconds: number[], kind: ParagraphKind = 'text'): TtsPlanInput[] {
  return seconds.map((value, idx) => ({ idx, paragraphIdx: 0, kind, charCount: 10, seconds: value }));
}

describe('planTtsSegments: speech-time budget', () => {
  it('closes a segment before its speech time would pass maxSeconds', () => {
    const sentences = timed([15, 15, 15, 15, 15]);
    expect(planTtsSegments(sentences, { maxSeconds: 40, firstMaxSeconds: 40 })).toEqual([
      { sentenceStart: 0, sentenceEnd: 1 },
      { sentenceStart: 2, sentenceEnd: 3 },
      { sentenceStart: 4, sentenceEnd: 4 },
    ]);
  });

  it('holds the first text segment to firstMaxSeconds, and later segments to maxSeconds', () => {
    const sentences = timed([5, 5, 5, 5, 5, 5]);
    expect(planTtsSegments(sentences, { maxSeconds: 40, firstMaxSeconds: 12 })).toEqual([
      { sentenceStart: 0, sentenceEnd: 1 },
      { sentenceStart: 2, sentenceEnd: 5 },
    ]);
  });

  it('does not count headings as the first text segment', () => {
    const sentences = [
      { idx: 0, paragraphIdx: 0, kind: 'heading' as const, charCount: 6, seconds: 0 },
      ...timed([5, 5, 5]).map((s) => ({ ...s, idx: s.idx + 1 })),
    ];
    expect(planTtsSegments(sentences, { maxSeconds: 40, firstMaxSeconds: 12 })).toEqual([
      { sentenceStart: 0, sentenceEnd: 0 },
      { sentenceStart: 1, sentenceEnd: 2 },
      { sentenceStart: 3, sentenceEnd: 3 },
    ]);
  });

  it('gives a single sentence over maxSeconds a segment of its own', () => {
    expect(planTtsSegments(timed([5, 50, 5]), { maxSeconds: 40, firstMaxSeconds: 12 })).toEqual([
      { sentenceStart: 0, sentenceEnd: 0 },
      { sentenceStart: 1, sentenceEnd: 1 },
      { sentenceStart: 2, sentenceEnd: 2 },
    ]);
  });

  it('gives a first sentence over firstMaxSeconds its own segment, and keeps the rest', () => {
    expect(planTtsSegments(timed([20, 5]), { maxSeconds: 40, firstMaxSeconds: 12 })).toEqual([
      { sentenceStart: 0, sentenceEnd: 0 },
      { sentenceStart: 1, sentenceEnd: 1 },
    ]);
  });

  it('ignores the speech budget when no sentence carries seconds, as before', () => {
    const sentences = plan([{ kind: 'text', sentences: [200, 200, 200] }]);
    expect(planTtsSegments(sentences, { maxChars: 600, minChars: 0 })).toEqual([
      { sentenceStart: 0, sentenceEnd: 2 },
    ]);
  });

  it('rejects a non-positive speech budget', () => {
    expect(() => planTtsSegments([], { maxSeconds: 0 })).toThrow(RangeError);
    expect(() => planTtsSegments([], { firstMaxSeconds: -1 })).toThrow(RangeError);
  });

  it('packs Mandarin by speech time, so 20-character sentences make about 100 characters a segment', () => {
    const han = '雨'.repeat(20);
    const sentences: TtsPlanInput[] = Array.from({ length: 30 }, (_, idx) => ({
      idx,
      paragraphIdx: 0,
      kind: 'text',
      charCount: 20,
      seconds: estimateSpeechSeconds(han, 'zh'),
    }));
    const segments = planTtsSegments(sentences, { maxChars: 600, maxSeconds: 40, firstMaxSeconds: 12 });
    // One opening sentence (8 s is over the 12 s budget with a second one), then five per 40 s.
    expect(segments.map((s) => s.sentenceEnd - s.sentenceStart + 1)).toEqual([1, 5, 5, 5, 5, 5, 4]);
  });

  it('packs Latin letters far more densely than Mandarin, for the same character count', () => {
    const latin = 'a'.repeat(20);
    const sentences: TtsPlanInput[] = Array.from({ length: 60 }, (_, idx) => ({
      idx,
      paragraphIdx: 0,
      kind: 'text',
      charCount: 20,
      seconds: estimateSpeechSeconds(latin, 'en'),
    }));
    const segments = planTtsSegments(sentences, { maxChars: 600, maxSeconds: 40, firstMaxSeconds: 12 });
    const longest = Math.max(...segments.map((s) => s.sentenceEnd - s.sentenceStart + 1));
    expect(longest).toBeGreaterThanOrEqual(15);
  });
});
