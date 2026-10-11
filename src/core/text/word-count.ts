/**
 * Han characters and kana. These scripts are written without spaces between words, so counting
 * whitespace-separated tokens would give a chapter of CJK text a word count near zero.
 */
const CJK_CHAR = /[぀-ヿ㐀-䶿一-鿿豈-﫿]/g;

/** Latin-script words are whitespace-separated tokens that contain a letter or digit. */
const WORD = /[\p{L}\p{N}]/u;

/**
 * Heuristic: 1.5 CJK characters count as one word. A Chinese or Japanese word is usually two
 * characters, so this lands a little above the true word count. The density rules are tuned to it.
 */
export const CJK_CHARS_PER_WORD = 1.5;

/**
 * Estimated word count for the chapter-level rules, rounded to an integer (the unit of
 * `chapters.word_count`). Latin, Cyrillic and other spaced scripts count one word per token.
 * Han and kana count `cjkChars / CJK_CHARS_PER_WORD`.
 */
export function estimateWordCount(text: string): number {
  const cjkChars = text.match(CJK_CHAR)?.length ?? 0;
  const spaced = text.replace(CJK_CHAR, ' ');
  let words = 0;
  for (const token of spaced.split(/\s+/u)) {
    if (token && WORD.test(token)) words += 1;
  }
  return Math.round(words + cjkChars / CJK_CHARS_PER_WORD);
}
