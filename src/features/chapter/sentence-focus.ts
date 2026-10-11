/** How long a deep-linked sentence stays highlighted before it fades out. */
export const HIGHLIGHT_MS = 1500;

/** The fade is linear. Reduce-motion keeps the highlight at full strength, then drops it. */
export const HIGHLIGHT_TICK_MS = 100;

/**
 * Reads the `sentence` route parameter: a 0-based sentence index. Anything else, including a
 * negative or fractional value, is no link at all.
 */
export function parseSentenceParam(value: string | readonly string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null;
  const index = Number(raw);
  return Number.isSafeInteger(index) ? index : null;
}

interface ParagraphLike {
  idx: number;
  sentences: readonly { idx: number }[];
}

/** The paragraph that holds a sentence, or null when no paragraph does. */
export function paragraphOfSentence(
  paragraphs: readonly ParagraphLike[],
  sentenceIdx: number,
): number | null {
  const found = paragraphs.find((paragraph) =>
    paragraph.sentences.some((sentence) => sentence.idx === sentenceIdx),
  );
  return found ? found.idx : null;
}

/** Highlight strength from 1 down to 0 over HIGHLIGHT_MS. Reduce-motion holds 1, then ends at 0. */
export function highlightStrength(elapsedMs: number, reduced: boolean): number {
  if (elapsedMs < 0 || elapsedMs >= HIGHLIGHT_MS) return 0;
  if (reduced) return 1;
  return 1 - elapsedMs / HIGHLIGHT_MS;
}
