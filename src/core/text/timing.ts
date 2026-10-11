import { detectScript } from './normalize';

/** Pause allowance, in character equivalents, for a sentence that ends with terminal punctuation. */
const TERMINAL_PAUSE_CHARS = 8;
/** Pause allowance, in character equivalents, for each comma, semicolon or colon. */
const COMMA_PAUSE_CHARS = 3;
const TERMINAL_PUNCTUATION = /[.!?…]["”’')\]»]*$/u;
const PAUSE_MARKS = /[,;:]/gu;
const LETTERS_AND_DIGITS = /[\p{L}\p{N}]/gu;
const NON_SPACE = /\S/gu;

/**
 * Estimated spoken weight of one sentence, in character equivalents. CJK sentences are weighted
 * by their non-space characters. Other scripts are weighted by letters and digits, plus pause
 * allowances for the sentence's terminal punctuation and for each comma-like mark.
 */
function spokenWeight(sentence: string): number {
  const text = sentence.trim();
  if (detectScript(text) === 'cjk') {
    return Math.max(1, (text.match(NON_SPACE) ?? []).length);
  }
  const letters = (text.match(LETTERS_AND_DIGITS) ?? []).length;
  const terminal = TERMINAL_PUNCTUATION.test(text) ? TERMINAL_PAUSE_CHARS : 0;
  const pauses = (text.match(PAUSE_MARKS) ?? []).length * COMMA_PAUSE_CHARS;
  return Math.max(1, letters + terminal + pauses);
}

/**
 * Estimated start offset of each sentence within a segment of `totalDurationMs`. Offsets are
 * proportional to spoken weight. The first offset is 0, the sequence never decreases, and every
 * offset is below `totalDurationMs`. Returns `[]` for no sentences.
 */
export function estimateSentenceOffsets(
  sentenceTexts: readonly string[],
  totalDurationMs: number,
): number[] {
  if (!(totalDurationMs >= 1)) {
    throw new RangeError(`totalDurationMs must be at least 1, got ${totalDurationMs}`);
  }
  if (sentenceTexts.length === 0) return [];

  const weights = sentenceTexts.map(spokenWeight);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const cap = Math.floor(totalDurationMs) - 1;
  const offsets: number[] = [];
  let before = 0;
  for (const weight of weights) {
    offsets.push(Math.min(cap, Math.floor((totalDurationMs * before) / totalWeight)));
    before += weight;
  }
  return offsets;
}

/**
 * Index of the sentence playing at `positionMs`: the last sentence whose offset is at or before
 * the position. Binary search over monotonic offsets. Returns -1 for an empty list.
 */
export function sentenceAt(offsets: readonly number[], positionMs: number): number {
  if (offsets.length === 0) return -1;
  if (positionMs < (offsets[0] ?? 0)) return 0;
  let low = 0;
  let high = offsets.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if ((offsets[mid] ?? Infinity) <= positionMs) low = mid;
    else high = mid - 1;
  }
  return low;
}
