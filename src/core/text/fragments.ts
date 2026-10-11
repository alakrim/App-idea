import { isNonTerminalPeriod } from './abbreviations';
import { detectScript, isHangul, isUnspacedCjk, scriptOfCodePoint } from './normalize';

/** Longest sentence kept whole. Longer ones are split at a secondary break. */
export const MAX_SENTENCE_CHARS = 400;

const LETTER_OR_DIGIT = /[\p{L}\p{N}]/gu;
const WORD = /[\p{L}\p{N}]+/gu;

/**
 * Fragments need two characters in CJK ideographs or kana, and three words in every other script.
 * Hangul is word-spaced, so it follows the word rule.
 */
function isShortFragment(sentence: string): boolean {
  if (detectScript(sentence) === 'cjk' && !isHangulDominant(sentence)) {
    return (sentence.match(LETTER_OR_DIGIT) ?? []).length < 2;
  }
  return (sentence.match(WORD) ?? []).length < 3;
}

function isHangulDominant(text: string): boolean {
  let hangul = 0;
  let others = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (isHangul(cp)) hangul += 1;
    else if (scriptOfCodePoint(cp) === 'cjk') others += 1;
  }
  return hangul > others;
}

function joinFragments(left: string, right: string): string {
  const lastOfLeft = Array.from(left).at(-1) ?? '';
  const firstOfRight = right.charAt(0);
  const cjkBoundary =
    isUnspacedCjk(lastOfLeft.codePointAt(0) ?? 0) || isUnspacedCjk(firstOfRight.codePointAt(0) ?? 0);
  return cjkBoundary ? `${left}${right}` : `${left} ${right}`;
}

/**
 * Attaches short fragments to the neighbouring sentence: to the previous one when there is one,
 * otherwise to the next one. Keeps the order and the total text.
 */
export function mergeShortFragments(fragments: readonly string[]): string[] {
  const out: string[] = [];
  let carry = '';
  for (const fragment of fragments) {
    const piece = carry === '' ? fragment : joinFragments(carry, fragment);
    carry = '';
    if (!isShortFragment(piece)) {
      out.push(piece);
    } else if (out.length > 0) {
      const last = out.length - 1;
      out[last] = joinFragments(out[last] ?? '', piece);
    } else {
      carry = piece;
    }
  }
  if (carry !== '') {
    if (out.length > 0) {
      const last = out.length - 1;
      out[last] = joinFragments(out[last] ?? '', carry);
    } else {
      out.push(carry);
    }
  }
  return out;
}

/**
 * Re-joins native segmenter output where a fragment ends in an abbreviation or initial. ICU splits
 * `Mr. Hollis` into two sentences, and this undoes that.
 */
export function repairNativeFragments(fragments: readonly string[]): string[] {
  const out: string[] = [];
  for (const fragment of fragments) {
    const last = out.length - 1;
    const previous = out[last];
    if (previous !== undefined && previous.endsWith('.') && isNonTerminalPeriod(previous.slice(0, -1))) {
      out[last] = joinFragments(previous, fragment);
    } else {
      out.push(fragment);
    }
  }
  return out;
}

/** Secondary break ranks: a higher rank wins over any later position of a lower rank. */
const BREAK_RANK_SEMICOLON = 3;
const BREAK_RANK_COLON = 2;
const BREAK_RANK_COMMA = 1;
const BREAK_RANK_SPACE = 0;

/** Index at which to cut `s` (which is longer than `max`), so that the left part fits in `max`. */
function bestCut(s: string, max: number): number {
  const minPosition = Math.floor(max / 4);
  const lastPosition = Math.min(max - 1, s.length - 2);
  let bestPosition = -1;
  let bestRank = -1;
  for (let p = minPosition; p <= lastPosition; p += 1) {
    const rank = breakRank(s, p);
    if (rank >= 0 && rank >= bestRank) {
      bestRank = rank;
      bestPosition = p;
    }
  }
  if (bestPosition < 0) {
    const hard = max;
    const isHighSurrogate = s.charCodeAt(hard - 1) >= 0xd800 && s.charCodeAt(hard - 1) <= 0xdbff;
    return isHighSurrogate ? hard - 1 : hard;
  }
  const punctuation = bestRank > BREAK_RANK_SPACE;
  return punctuation ? bestPosition + 1 : bestPosition;
}

/** Rank of a possible break at character `p`, or -1 when `p` is not a break. */
function breakRank(s: string, p: number): number {
  const ch = s.charAt(p);
  const next = s.charAt(p + 1);
  const nextIsSpaceOrEnd = next === '' || /\s/u.test(next);
  if (ch === ';') return nextIsSpaceOrEnd ? BREAK_RANK_SEMICOLON : -1;
  if (ch === '；') return BREAK_RANK_SEMICOLON;
  if (ch === ':') return nextIsSpaceOrEnd ? BREAK_RANK_COLON : -1;
  if (ch === '：') return BREAK_RANK_COLON;
  if (ch === ',') return nextIsSpaceOrEnd ? BREAK_RANK_COMMA : -1;
  if (ch === '，' || ch === '、' || ch === '،') return BREAK_RANK_COMMA;
  if (/\s/u.test(ch)) return BREAK_RANK_SPACE;
  return -1;
}

/**
 * Splits a sentence longer than `max` characters at the best secondary break (`;`, `:`, a comma,
 * then whitespace), recursively. Falls back to a hard cut that never splits a surrogate pair.
 * The pieces are trimmed, so the concatenation equals the input modulo whitespace.
 */
export function splitLongSentence(sentence: string, max: number = MAX_SENTENCE_CHARS): string[] {
  const s = sentence.trim();
  if (s === '') return [];
  if (s.length <= max) return [s];
  const cut = bestCut(s, max);
  return [...splitLongSentence(s.slice(0, cut), max), ...splitLongSentence(s.slice(cut), max)];
}
