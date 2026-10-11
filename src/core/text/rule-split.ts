import { isNonTerminalPeriod } from './abbreviations';
import { detectScript } from './normalize';

/** Full-width or unambiguous CJK terminators: they end a sentence without a following space. */
const FULLWIDTH_TERMINATORS: ReadonlySet<string> = new Set(['。', '！', '？', '‼', '⁇', '⁈', '⁉']);
/** Closing marks that stay with the sentence they end, e.g. `."` or `」`. */
const CLOSERS_AFTER_TERMINATOR: ReadonlySet<string> = new Set([
  '”',
  '’',
  '"',
  "'",
  '）',
  ')',
  '】',
  '〉',
  '》',
  '」',
  '』',
  '»',
  ']',
]);
/** Opening quote or bracket and the mark that closes it. ASCII `"` toggles and is handled apart. */
const PAIRS: ReadonlyMap<string, string> = new Map([
  ['“', '”'],
  ['„', '“'],
  ['«', '»'],
  ['「', '」'],
  ['『', '』'],
  ['（', '）'],
  ['(', ')'],
]);
/** Characters that can open a new sentence in Latin text, besides capitals and caseless letters. */
const SENTENCE_OPENERS: ReadonlySet<string> = new Set([
  '"',
  '“',
  '„',
  '«',
  '「',
  '『',
  '‘',
  '¿',
  '¡',
  '（',
  '(',
]);
const CASED_OR_CASELESS_LETTER = /^[\p{Lu}\p{Lt}\p{Lo}]$/u;
const WHITESPACE = /\s/u;
/** A CJK quotation is only split inside when this much text follows the sentence end. */
const CJK_QUOTE_MIN_REST = 40;

/**
 * Rule-based sentence splitter for one paragraph. It is CJK-aware (fullwidth terminators plus
 * closing quotes), protects abbreviations, initials, decimals, URLs and ellipses inside quotes,
 * and needs no Unicode case data beyond `\p{Lu}`.
 *
 * Returns trimmed, non-empty sentences whose concatenation equals the input modulo whitespace.
 */
export function splitByRules(paragraph: string): string[] {
  const cjkMode = detectScript(paragraph) === 'cjk';
  const cuts: number[] = [];
  const expectedClosers: string[] = [];
  let i = 0;
  while (i < paragraph.length) {
    const ch = paragraph.charAt(i);
    if (!isTerminator(ch)) {
      applyQuoteChar(expectedClosers, ch);
      i += 1;
      continue;
    }
    let j = i;
    while (j < paragraph.length && isTerminator(paragraph.charAt(j))) j += 1;
    const run = paragraph.slice(i, j);
    const depthBefore = expectedClosers.length;
    let k = j;
    while (k < paragraph.length && isCloserAfterTerminator(paragraph.charAt(k), expectedClosers)) {
      applyQuoteChar(expectedClosers, paragraph.charAt(k));
      k += 1;
    }
    const inQuote = depthBefore > 0;
    const closesQuote = inQuote && expectedClosers.length < depthBefore;
    if (
      isBoundary({ text: paragraph, run, i, k, cjkMode, inQuote, closesQuote, expectedClosers })
    ) {
      cuts.push(k);
    }
    i = k;
  }
  return assemble(paragraph, cuts);
}

function isTerminator(ch: string): boolean {
  return FULLWIDTH_TERMINATORS.has(ch) || ch === '…' || ch === '!' || ch === '?' || ch === '.';
}

function isCloserAfterTerminator(ch: string, expectedClosers: readonly string[]): boolean {
  if (ch === '"') return expectedClosers[expectedClosers.length - 1] === '"';
  return CLOSERS_AFTER_TERMINATOR.has(ch);
}

/** Tracks open quotes and brackets. A closer only pops when it matches the innermost opener. */
function applyQuoteChar(expectedClosers: string[], ch: string): void {
  if (ch === '"') {
    if (expectedClosers[expectedClosers.length - 1] === '"') expectedClosers.pop();
    else expectedClosers.push('"');
    return;
  }
  const closer = PAIRS.get(ch);
  if (closer !== undefined) {
    expectedClosers.push(closer);
    return;
  }
  if (expectedClosers[expectedClosers.length - 1] === ch) expectedClosers.pop();
}

interface BoundaryContext {
  readonly text: string;
  readonly run: string;
  readonly i: number;
  readonly k: number;
  readonly cjkMode: boolean;
  readonly inQuote: boolean;
  readonly closesQuote: boolean;
  readonly expectedClosers: readonly string[];
}

function isBoundary(c: BoundaryContext): boolean {
  // Fullwidth marks, and `!?…` in CJK text, end a sentence without a following space.
  // An ASCII period always follows the Latin rules, because Korean uses it with spaces.
  const spaceFree =
    [...c.run].some((ch) => FULLWIDTH_TERMINATORS.has(ch)) || (c.cjkMode && c.run !== '.');
  if (spaceFree) {
    if (!c.inQuote || c.closesQuote) return true;
    return restOfOpenQuote(c) > CJK_QUOTE_MIN_REST;
  }

  const isEllipsis = c.run === '…' || /^\.{2,}$/u.test(c.run);
  if (isEllipsis && c.inQuote && !c.closesQuote) return false;
  if (c.run === '.' && isNonTerminalPeriod(c.text.slice(0, c.i))) return false;

  const next = skipWhitespace(c.text, c.k);
  if (next === c.k || next >= c.text.length) return false;
  return startsSentence(c.text, next);
}

function restOfOpenQuote(c: BoundaryContext): number {
  const closer = c.expectedClosers[c.expectedClosers.length - 1];
  const end = closer === undefined ? -1 : c.text.indexOf(closer, c.k);
  return c.text.slice(c.k, end < 0 ? c.text.length : end).trim().length;
}

function skipWhitespace(text: string, from: number): number {
  let p = from;
  while (p < text.length && WHITESPACE.test(text.charAt(p))) p += 1;
  return p;
}

function startsSentence(text: string, at: number): boolean {
  const ch = String.fromCodePoint(text.codePointAt(at) ?? 0);
  if (ch === '—') {
    // A dash opens a new speech turn only when a capital follows it. A lower-case word after the
    // dash is a dialogue tag (`— chiese il figlio`).
    const letter = String.fromCodePoint(text.codePointAt(skipWhitespace(text, at + 1)) ?? 0);
    return CASED_OR_CASELESS_LETTER.test(letter);
  }
  return SENTENCE_OPENERS.has(ch) || CASED_OR_CASELESS_LETTER.test(ch);
}

function assemble(text: string, cuts: readonly number[]): string[] {
  const out: string[] = [];
  let start = 0;
  for (const cut of [...cuts, text.length]) {
    const piece = text.slice(start, cut).trim();
    if (piece !== '') out.push(piece);
    start = cut;
  }
  return out;
}
