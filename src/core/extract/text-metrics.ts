/**
 * CJK ideographs, kana, Hangul syllables and Thai, as explicit BMP ranges. Explicit ranges avoid
 * Unicode property escapes, which Hermes may not support.
 */
const CJK_CHAR = /[฀-๿ᄀ-ᇿ぀-ヿ㄰-㆏㐀-䶿一-鿿가-힯豈-﫿]/g;

/** Latin-script words are whitespace-separated tokens that contain a letter or digit. */
const WORD = /[\p{L}\p{N}]/u;

/** Terminal characters that close a sentence, including closing quotes and brackets. */
const TERMINAL = /[.!?…。！？」』”’"')）]$/u;

function countCjkChars(text: string): number {
  return text.match(CJK_CHAR)?.length ?? 0;
}

/** Effective length from the R3 spec: Latin words count 1, CJK characters count 0.5. */
export function measureUnits(text: string): number {
  const latin = text.replace(CJK_CHAR, ' ');
  let words = 0;
  for (const token of latin.split(/\s+/)) {
    if (token && WORD.test(token)) words++;
  }
  return words + 0.5 * countCjkChars(text);
}

export function endsSentence(text: string): boolean {
  return TERMINAL.test(text.trimEnd());
}

/** Lowercase and collapse whitespace. Digits are kept, so "Chapter 1" never matches "Chapter 12". */
export function exactKey(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Like `exactKey`, but digits are dropped so "Part 2" and "Part 3" count as repeats. */
export function shapeKey(text: string): string {
  return exactKey(text).replace(/\d+/g, '0');
}
