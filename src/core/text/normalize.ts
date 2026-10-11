/** Writing systems the text engine distinguishes. `other` covers Greek, Hebrew, Devanagari, etc. */
export type Script = 'latin' | 'cjk' | 'cyrillic' | 'arabic' | 'thai' | 'other';

/**
 * Collapses every run of Unicode whitespace into a single ASCII space and trims both ends.
 * It never inserts characters between existing ones, so CJK text, emoji and surrogate pairs
 * pass through unchanged apart from their whitespace.
 */
export function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/gu, ' ').trim();
}

const LINE_SEPARATORS = new RegExp('\\r\\n?|[\\u2028\\u2029]', 'gu');
// Soft hyphens, zero-width spaces, bidi marks and the BOM. ZWNJ (U+200C) and ZWJ (U+200D) are kept
// on purpose: they carry meaning in Persian, Indic scripts and emoji sequences.
const INVISIBLE_CHARS = new RegExp('[\\u00AD\\u200B\\u200E\\u200F\\u202A-\\u202E\\u2060\\u2066-\\u2069\\uFEFF]', 'gu');
const SPACE_VARIANTS = new RegExp('[\\u00A0\\u1680\\u2000-\\u200A\\u202F\\u205F\\u3000]', 'gu');
const HORIZONTAL_SPACE_RUN = /[^\S\n]+/gu;
const SPACES_AROUND_NEWLINE = / ?\n ?/gu;
const EXCESS_NEWLINES = /\n{3,}/gu;
// Only prime marks are mapped: they are unambiguously quotes or apostrophes. Curly quotes are left
// alone because they mean different things in English and CJK dialogue, and CJK punctuation is
// never touched.
const PRIME_QUOTES: ReadonlyArray<readonly [RegExp, string]> = [
  [new RegExp('\\u2032', 'gu'), "'"],
  [new RegExp('\\u2033', 'gu'), '"'],
];

/**
 * Canonical text form used by every downstream stage: NFC, one line-break style, no invisible
 * characters, single spaces, at most one blank line in a row, and trimmed. Idempotent.
 */
export function normalizeText(input: string): string {
  const cleaned = input
    .normalize('NFC')
    .replace(LINE_SEPARATORS, '\n')
    .replace(INVISIBLE_CHARS, '')
    .replace(SPACE_VARIANTS, ' ')
    .replace(HORIZONTAL_SPACE_RUN, ' ')
    .replace(SPACES_AROUND_NEWLINE, '\n')
    .replace(EXCESS_NEWLINES, '\n\n');
  return PRIME_QUOTES.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), cleaned).trim();
}

const CJK_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x1100, 0x11ff], // Hangul Jamo
  [0x2e80, 0x2fdf], // CJK radicals
  [0x3040, 0x30ff], // Hiragana and Katakana
  [0x3100, 0x312f], // Bopomofo
  [0x3130, 0x318f], // Hangul compatibility Jamo
  [0x31f0, 0x31ff], // Katakana phonetic extensions
  [0x3400, 0x4dbf], // CJK extension A
  [0x4e00, 0x9fff], // CJK unified ideographs
  [0xac00, 0xd7af], // Hangul syllables
  [0xf900, 0xfaff], // CJK compatibility ideographs
  [0x20000, 0x2fa1f], // CJK extensions B to F and compatibility supplement
];

const inRanges = (cp: number, ranges: ReadonlyArray<readonly [number, number]>): boolean =>
  ranges.some(([from, to]) => cp >= from && cp <= to);

/** Script of a single code point, or null for spaces, digits, punctuation and symbols. */
export function scriptOfCodePoint(cp: number): Script | null {
  if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a) || cp === 0xaa || cp === 0xba) {
    return 'latin';
  }
  if (cp >= 0xc0 && cp <= 0x24f) return cp === 0xd7 || cp === 0xf7 ? null : 'latin';
  if (cp >= 0x1e00 && cp <= 0x1eff) return 'latin';
  if (cp >= 0x400 && cp <= 0x52f) return 'cyrillic';
  if (
    inRanges(cp, [
      [0x600, 0x6ff],
      [0x750, 0x77f],
      [0x8a0, 0x8ff],
      [0xfb50, 0xfdff],
      [0xfe70, 0xfeff],
    ])
  ) {
    return 'arabic';
  }
  if (cp >= 0xe00 && cp <= 0xe7f) return 'thai';
  if (inRanges(cp, CJK_RANGES)) return 'cjk';
  return null;
}

/** True for CJK letters and for the CJK and fullwidth punctuation blocks that surround them. */
export function isCjkLike(cp: number): boolean {
  return scriptOfCodePoint(cp) === 'cjk' || (cp >= 0x3000 && cp <= 0x303f) || (cp >= 0xff00 && cp <= 0xffef);
}

/**
 * Writing system of a text: the script with the most letters wins. Returns `other` when the text
 * has no letters from the supported scripts. Hangul is reported as `cjk` because it shares the
 * no-space, no-case segmentation rules.
 */
export function detectScript(text: string): Script {
  const counts = new Map<Script, number>();
  for (const ch of text) {
    const script = scriptOfCodePoint(ch.codePointAt(0) ?? 0);
    if (script !== null) counts.set(script, (counts.get(script) ?? 0) + 1);
  }
  let best: Script = 'other';
  let bestCount = 0;
  for (const [script, count] of counts) {
    if (count > bestCount) {
      best = script;
      bestCount = count;
    }
  }
  return best;
}
