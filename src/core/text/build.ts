import { toParagraphs } from './paragraphs';
import { segmentSentences } from './segment';

import type { ParagraphKind } from './paragraphs';
import type { SegmentOptions } from './segment';

export interface Paragraph {
  idx: number;
  kind: ParagraphKind;
  text: string;
  /** First sentence of this paragraph, inclusive. */
  sentenceStart: number;
  /** One past the last sentence of this paragraph (exclusive). */
  sentenceEnd: number;
}

export interface Sentence {
  /** Stable 0-based index across the whole chapter. */
  idx: number;
  paragraphIdx: number;
  /** Kind of the owning paragraph, so chunk planners can treat headings specially. */
  kind: ParagraphKind;
  text: string;
  /** Length in Unicode code points. */
  charCount: number;
}

export interface ChapterText {
  paragraphs: Paragraph[];
  sentences: Sentence[];
}

/** Code points in a string, which counts a CJK ideograph or an emoji as one character. */
export function countCodePoints(text: string): number {
  return Array.from(text).length;
}

/** Normalises raw chapter text and returns its paragraphs and sentences with stable indices. */
export function buildChapterText(
  rawText: string,
  lang?: string,
  options: SegmentOptions = {},
): ChapterText {
  const paragraphs: Paragraph[] = [];
  const sentences: Sentence[] = [];
  toParagraphs(rawText).forEach((block, paragraphIdx) => {
    const sentenceStart = sentences.length;
    for (const text of segmentSentences(block.text, lang, options)) {
      sentences.push({
        idx: sentences.length,
        paragraphIdx,
        kind: block.kind,
        text,
        charCount: countCodePoints(text),
      });
    }
    paragraphs.push({
      idx: paragraphIdx,
      kind: block.kind,
      text: block.text,
      sentenceStart,
      sentenceEnd: sentences.length,
    });
  });
  return { paragraphs, sentences };
}
