import { FIRST_WINDOW_SECONDS, firstWindowEnd } from './first-window';
import { estimateSpeechSeconds } from '../text/speech-rate';

/** Sentences with idx values 0, 1, 2 ... and the given text. */
function sentencesOf(texts: readonly string[]): { idx: number; text: string }[] {
  return texts.map((text, idx) => ({ idx, text }));
}

/** Estimated seconds of the sentences from `from` through `to`, both inclusive. */
function secondsBetween(
  sentences: readonly { idx: number; text: string }[],
  to: number,
  lang: string | null,
): number {
  return sentences
    .filter((s) => s.idx <= to && s.text.trim() !== '')
    .reduce((sum, s) => sum + estimateSpeechSeconds(s.text, lang), 0);
}

const LATIN = Array.from(
  { length: 60 },
  (_, n) => `Sentence ${n} of the harbour chapter is spoken at a steady and easy pace.`,
);
const HAN = Array.from({ length: 60 }, (_, n) => `第${n}句话讲述了港口里的故事和海浪的声音。`);

describe('firstWindowEnd: Latin', () => {
  it('ends at the sentence that takes the window past the target, and includes it', () => {
    const sentences = sentencesOf(LATIN);
    const end = firstWindowEnd(sentences, 'en');

    expect(secondsBetween(sentences, end, 'en')).toBeGreaterThanOrEqual(FIRST_WINDOW_SECONDS);
    expect(secondsBetween(sentences, end - 1, 'en')).toBeLessThan(FIRST_WINDOW_SECONDS);
  });

  it('covers the whole chapter when the chapter is shorter than the window', () => {
    const sentences = sentencesOf(['Short one.', 'Short two.']);
    expect(firstWindowEnd(sentences, 'en')).toBe(1);
  });

  it('skips blank sentences, so they neither count nor end the window', () => {
    const sentences = sentencesOf(['Hello there.', '   ', '']);
    expect(firstWindowEnd(sentences, 'en')).toBe(0);
  });

  it('returns -1 when there is no text to speak', () => {
    expect(firstWindowEnd([], 'en')).toBe(-1);
    expect(firstWindowEnd(sentencesOf(['  ', '\n']), 'en')).toBe(-1);
  });
});

describe('firstWindowEnd: CJK', () => {
  it('ends at the crossing sentence by the Han speech rate, so the window holds fewer characters', () => {
    const sentences = sentencesOf(HAN);
    const end = firstWindowEnd(sentences, 'zh');

    expect(secondsBetween(sentences, end, 'zh')).toBeGreaterThanOrEqual(FIRST_WINDOW_SECONDS);
    expect(secondsBetween(sentences, end - 1, 'zh')).toBeLessThan(FIRST_WINDOW_SECONDS);
  });

  it('holds fewer characters than the same text in Latin, because CJK is read more slowly per character', () => {
    const latinEnd = firstWindowEnd(sentencesOf(LATIN), 'en');
    const hanEnd = firstWindowEnd(sentencesOf(HAN), 'zh');
    const latinChars = LATIN.slice(0, latinEnd + 1).join('').length;
    const hanChars = HAN.slice(0, hanEnd + 1).join('').length;

    expect(hanChars).toBeLessThan(latinChars);
  });
});
