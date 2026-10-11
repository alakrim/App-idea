import { CJK_CHARS_PER_WORD, estimateWordCount } from './word-count';

describe('estimateWordCount', () => {
  it('counts whitespace-separated Latin words', () => {
    expect(estimateWordCount('Hello brave new world.')).toBe(4);
  });

  it('counts Cyrillic and accented words as words', () => {
    expect(estimateWordCount('Привет мир, café crème')).toBe(4);
  });

  it('counts a Han or kana run at 1.5 characters per word', () => {
    expect(CJK_CHARS_PER_WORD).toBe(1.5);
    expect(estimateWordCount('東京タワー')).toBe(3); // 5 characters, 3.33 words, rounded
    expect(estimateWordCount('夜'.repeat(1500))).toBe(1000);
  });

  it('adds Latin words and CJK characters together', () => {
    expect(estimateWordCount('Hello 世界')).toBe(2); // 1 word + 2 characters (1.33 words)
  });

  it('does not count punctuation as words', () => {
    expect(estimateWordCount('— — ! 。、「」')).toBe(0);
  });

  it('returns 0 for empty text', () => {
    expect(estimateWordCount('')).toBe(0);
  });
});
