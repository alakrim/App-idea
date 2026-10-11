import { useCallback, useEffect, useRef } from 'react';

import { space } from '@/ui/tokens';

import { paragraphOfSentence } from './sentence-focus';

interface ParagraphLike {
  idx: number;
  sentences: readonly { idx: number }[];
}

export interface SentenceScrollLayout {
  /** Where the text section starts in the scroll content. */
  onSectionLayout: (y: number) => void;
  /** Where the reading text starts inside that section. */
  onReadingLayout: (y: number) => void;
  /** Where a paragraph starts inside the reading text. */
  onParagraphLayout: (paragraphIdx: number, y: number) => void;
}

export interface SentenceScrollOptions {
  /** The sentence a deep link asks for, or null. */
  focusSentence: number | null;
  paragraphs: readonly ParagraphLike[];
  reduced: boolean;
  /** Scrolls the chapter to `y`. Must be a stable function. */
  scrollTo: (y: number, animated: boolean) => void;
}

/**
 * Scrolls a chapter to a deep-linked sentence. The offsets arrive from onLayout in no fixed order, so
 * the scroll waits until the paragraph and both enclosing positions are known. Each link scrolls once:
 * a later re-read of the chapter, which hands over new paragraph arrays, does not scroll again.
 */
export function useSentenceScroll({
  focusSentence,
  paragraphs,
  reduced,
  scrollTo,
}: SentenceScrollOptions): SentenceScrollLayout {
  const offsets = useRef<{
    section: number | null;
    reading: number | null;
    paragraphs: Map<number, number>;
  }>({ section: null, reading: null, paragraphs: new Map() });
  const pending = useRef<number | null>(null);
  const scrolled = useRef<number | null>(null);

  const scrollToPending = useCallback(() => {
    const sentenceIdx = pending.current;
    if (sentenceIdx === null) return;
    const paragraphIdx = paragraphOfSentence(paragraphs, sentenceIdx);
    if (paragraphIdx === null) {
      pending.current = null;
      return;
    }
    const { section, reading, paragraphs: known } = offsets.current;
    const paragraphY = known.get(paragraphIdx);
    if (section === null || reading === null || paragraphY === undefined) return;
    pending.current = null;
    scrolled.current = sentenceIdx;
    scrollTo(Math.max(0, section + reading + paragraphY - space.xl), !reduced);
  }, [paragraphs, reduced, scrollTo]);

  useEffect(() => {
    if (focusSentence === null) {
      pending.current = null;
      scrolled.current = null;
      return;
    }
    if (scrolled.current === focusSentence) return;
    pending.current = focusSentence;
    scrollToPending();
  }, [focusSentence, scrollToPending]);

  return {
    onSectionLayout: useCallback(
      (y: number) => {
        offsets.current.section = y;
        scrollToPending();
      },
      [scrollToPending],
    ),
    onReadingLayout: useCallback(
      (y: number) => {
        offsets.current.reading = y;
        scrollToPending();
      },
      [scrollToPending],
    ),
    onParagraphLayout: useCallback(
      (paragraphIdx: number, y: number) => {
        offsets.current.paragraphs.set(paragraphIdx, y);
        scrollToPending();
      },
      [scrollToPending],
    ),
  };
}
