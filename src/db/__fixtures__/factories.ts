import type { Chapter, Series } from '../../core/domain';
import type { ChapterText } from '../repos/text-repo';

export const T0 = 1_700_000_000_000;

/** Deterministic, valid ULIDs for readable fixtures: id(1) is 00...01. */
export const id = (n: number): string => String(n).padStart(26, '0');

export function seriesRow(n: number, overrides: Partial<Series> = {}): Series {
  return {
    id: id(n),
    title: `Series ${n}`,
    coverUri: null,
    coverTint: null,
    sourceLang: 'en',
    targetLang: null,
    narrationProfileId: null,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

export function chapterRow(
  n: number,
  seriesN: number,
  order: number,
  overrides: Partial<Chapter> = {},
): Chapter {
  return {
    id: id(n),
    seriesId: id(seriesN),
    order,
    title: `Chapter ${n}`,
    source: { kind: 'text', label: 'pasted' },
    sourceLang: 'en',
    status: 'ready',
    wordCount: null,
    durationMs: 60_000,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

/** One paragraph holding every sentence, so each fixture is valid for the FK and idx constraints. */
export function chapterText(chapterN: number, sentenceTexts: string[]): ChapterText {
  const chapterId = id(chapterN);
  return {
    paragraphs: [{ idx: 0, sentenceStart: 0, sentenceEnd: sentenceTexts.length, kind: 'text' }],
    sentences: sentenceTexts.map((text, idx) => ({
      chapterId,
      idx,
      paragraphIdx: 0,
      text,
      translated: null,
      charCount: [...text].length,
    })),
  };
}
