/*
 * Speech rate by writing system. Narration time is estimated from characters, but one character
 * means very different amounts of speech in different scripts: a Mandarin character is one syllable,
 * an English letter is a fraction of a word.
 *
 * Calibrated on 2026-10-11 against live narration from the default voice (Gemini 3.8 Flash Lite TTS,
 * voice Kore, "measured pace" audiobook style), counting letters, digits and CJK characters only:
 * - Latin: English 9.5, Italian 9.5, Portuguese 8.7 characters a second, so 9.2.
 * - Han (Mandarin): 2.65 and 2.37 characters a second, so 2.5.
 * - Japanese (kana and kanji mixed): 4.2 characters a second.
 * Not measured yet, so scaled from conversational rates by the same narrator slowdown (about 0.6):
 * - Hangul (ko): 4. Thai (th): 6. Other scripts (Arabic, Hebrew, Devanagari, ...): 7.5.
 * Faster voices (ElevenLabs measured about 12.8 Latin characters a second) make these estimates
 * slightly long, which errs on the safe side for cost previews.
 *
 * Only letters, digits and combining marks are counted. Whitespace, punctuation and symbols take
 * no narration time. Callers that only have a character count, such as the cost preview, pass a
 * language to pick a rate. With no language they use the ADR-0003 hour (54,000 characters, 15 a second).
 */

export type SpeechRate = 'latin' | 'han' | 'japanese' | 'hangul' | 'thai' | 'other';

export const SPEECH_CHARS_PER_SECOND: Readonly<Record<SpeechRate, number>> = {
  latin: 9.2,
  han: 2.5,
  japanese: 4.2,
  hangul: 4,
  thai: 6,
  other: 7.5,
};

/** Rate of each language family, keyed by the primary subtag. Unlisted languages use the script. */
const LANGUAGE_RATE: Readonly<Record<string, SpeechRate>> = {
  zh: 'han',
  ja: 'japanese',
  ko: 'hangul',
  th: 'thai',
  en: 'latin',
  es: 'latin',
  fr: 'latin',
  de: 'latin',
  it: 'latin',
  pt: 'latin',
  nl: 'latin',
  sv: 'latin',
  da: 'latin',
  nb: 'latin',
  no: 'latin',
  nn: 'latin',
  fi: 'latin',
  pl: 'latin',
  cs: 'latin',
  sk: 'latin',
  ro: 'latin',
  hu: 'latin',
  hr: 'latin',
  sl: 'latin',
  ca: 'latin',
  id: 'latin',
  ms: 'latin',
  tr: 'latin',
  vi: 'latin',
  ru: 'latin',
  uk: 'latin',
  bg: 'latin',
  sr: 'latin',
  mk: 'latin',
  be: 'latin',
  el: 'latin',
  ar: 'other',
  he: 'other',
  hi: 'other',
  fa: 'other',
  ur: 'other',
  bn: 'other',
};

/** Letters, digits and combining marks. Everything else takes no narration time. */
const SPOKEN_CHAR = /[\p{L}\p{N}\p{M}]/u;
const KANA = /[぀-ヿｦ-ﾝ]/u;

const inRange = (cp: number, ranges: readonly (readonly [number, number])[]): boolean =>
  ranges.some(([from, to]) => cp >= from && cp <= to);

const KANA_RANGES = [
  [0x3040, 0x30ff], // Hiragana and Katakana
  [0x31f0, 0x31ff], // Katakana phonetic extensions
  [0xff66, 0xff9d], // Halfwidth Katakana
] as const;

const HAN_RANGES = [
  [0x2e80, 0x2fdf], // CJK radicals
  [0x3400, 0x4dbf], // CJK extension A
  [0x4e00, 0x9fff], // CJK unified ideographs
  [0xf900, 0xfaff], // CJK compatibility ideographs
  [0x20000, 0x2fa1f], // CJK extensions B to F and compatibility supplement
] as const;

const HANGUL_RANGES = [
  [0x1100, 0x11ff], // Hangul Jamo
  [0x3130, 0x318f], // Hangul compatibility Jamo
  [0xac00, 0xd7af], // Hangul syllables
] as const;

/** Latin, Greek and Cyrillic letters, with Latin and Greek extended blocks. */
const LATIN_GREEK_CYRILLIC_RANGES = [
  [0x0041, 0x024f],
  [0x0370, 0x03ff],
  [0x0400, 0x052f],
  [0x1e00, 0x1fff],
] as const;

function rateOfCodePoint(cp: number, japaneseContext: boolean): SpeechRate {
  if (inRange(cp, KANA_RANGES)) return 'japanese';
  if (inRange(cp, HAN_RANGES)) return japaneseContext ? 'japanese' : 'han';
  if (inRange(cp, HANGUL_RANGES)) return 'hangul';
  if (cp >= 0x0e00 && cp <= 0x0e7f) return 'thai';
  if (inRange(cp, LATIN_GREEK_CYRILLIC_RANGES)) return 'latin';
  return 'other';
}

/** The rate for a language tag, or null when the tag is missing or not in the table. */
export function speechRateForLanguage(lang: string | null | undefined): SpeechRate | null {
  if (!lang) return null;
  const primary = (lang.split('-')[0] ?? lang).toLowerCase();
  return LANGUAGE_RATE[primary] ?? null;
}

/**
 * Estimated narration seconds for a text. With a language tag, every spoken character uses that
 * language's rate. Without one, each character uses the rate of its own script, and Han characters
 * count as Japanese when the text also contains kana.
 */
export function estimateSpeechSeconds(text: string, lang?: string | null): number {
  const fixed = speechRateForLanguage(lang);
  const japaneseContext = fixed === null && KANA.test(text);
  let seconds = 0;
  for (const ch of text) {
    if (!SPOKEN_CHAR.test(ch)) continue;
    const rate = fixed ?? rateOfCodePoint(ch.codePointAt(0) ?? 0, japaneseContext);
    seconds += 1 / SPEECH_CHARS_PER_SECOND[rate];
  }
  return seconds;
}

/**
 * Characters a second for a count with no language. It is the ADR-0003 convention of 54,000
 * characters per hour of narration. The settings voice tiers are priced on that hour, so they keep
 * it. Chapters always pass their spoken language, which selects a script-aware rate.
 */
export const HOUR_CONVENTION_CHARS_PER_SECOND = 15;

/** Estimated narration seconds for a count of characters, where the language is known or not. */
export function estimateSpeechSecondsForChars(count: number, lang?: string | null): number {
  const rate = speechRateForLanguage(lang);
  return rate === null
    ? count / HOUR_CONVENTION_CHARS_PER_SECOND
    : count / SPEECH_CHARS_PER_SECOND[rate];
}
