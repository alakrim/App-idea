/** Matches "(Ch. 3)" and lists such as "(Ch. 3, 5)", the form the Q&A prompt asks the model to use. */
const CITATION_PATTERN = /\(Ch\.\s*(\d+(?:\s*,\s*\d+)*)\)/giu;

export type AnswerPart =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'cite'; readonly chapterNumber: number };

/** Splits an answer into prose and citation markers, in reading order. */
export function splitAnswer(text: string): AnswerPart[] {
  const parts: AnswerPart[] = [];
  let last = 0;
  for (const match of text.matchAll(CITATION_PATTERN)) {
    const start = match.index ?? 0;
    if (start > last) parts.push({ kind: 'text', text: text.slice(last, start) });
    for (const number of listNumbers(match[1] ?? '')) {
      parts.push({ kind: 'cite', chapterNumber: number });
    }
    last = start + match[0].length;
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) });
  return parts;
}

/**
 * The Q&A prompt has the model say the answer "has not been revealed yet" when the notes do not
 * answer. Such an answer rests on no chapter, so it carries no citations.
 */
const NOT_REVEALED_PATTERN = /\bnot\s+(?:been\s+)?revealed\s+yet\b/iu;

export function isNotRevealedAnswer(text: string): boolean {
  return NOT_REVEALED_PATTERN.test(text);
}

/** Distinct chapter numbers cited in an answer, in first-cited order. None for a not-revealed answer. */
export function citedChapterNumbers(text: string): number[] {
  if (isNotRevealedAnswer(text)) return [];
  const seen = new Set<number>();
  for (const part of splitAnswer(text)) {
    if (part.kind === 'cite') seen.add(part.chapterNumber);
  }
  return [...seen];
}

function listNumbers(list: string): number[] {
  return list
    .split(',')
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter((n) => Number.isSafeInteger(n) && n > 0);
}
