import {
  estimateSpeechSeconds,
  estimateSpeechSecondsForChars,
  SPEECH_CHARS_PER_SECOND,
  speechRateForLanguage,
} from './speech-rate';
import { CUE_LIMITS } from '../analysis/limits';

/** A 4-sentence Mandarin rain cue of about 70 characters, the shape of the live-test cue. */
const RAIN_CUE = [
  '细雨从屋檐缓缓滴落在青石板上。',
  '远处的钟声被雨幕轻轻吞没，只剩下沙沙的响动。',
  '街角的灯笼在水汽里晕开一圈暖黄的光。',
  '没有人说话，只有雨一直下着。',
];

const hanCount = (text: string): number =>
  [...text].filter((ch) => /\p{Script=Han}/u.test(ch)).length;

describe('estimateSpeechSeconds', () => {
  it('times the live-test Mandarin rain cue at the measured Han rate, and it survives the cue floor', () => {
    const text = RAIN_CUE.join('');
    const chars = [...text].length;
    expect(chars).toBeGreaterThanOrEqual(60);
    expect(chars).toBeLessThanOrEqual(80);

    const seconds = estimateSpeechSeconds(text, 'zh');
    expect(seconds).toBeCloseTo(hanCount(text) / SPEECH_CHARS_PER_SECOND.han, 6);
    // Under the hour convention (15 characters a second) this cue would take under 5 seconds.
    expect(seconds).toBeGreaterThan(CUE_LIMITS.minSeconds);
  });

  it('times an English three-sentence cue at the measured Latin rate', () => {
    const text = 'Rain fell on the harbour. The lamps flickered. Nobody spoke.';
    const letters = text.replace(/[^A-Za-z]/g, '').length;
    expect(estimateSpeechSeconds(text, 'en')).toBeCloseTo(
      letters / SPEECH_CHARS_PER_SECOND.latin,
      6,
    );
  });

  it('ignores whitespace, punctuation and symbols', () => {
    expect(estimateSpeechSeconds('  ... ! ?  ', 'en')).toBe(0);
    expect(estimateSpeechSeconds('a b', 'en')).toBeCloseTo(2 / SPEECH_CHARS_PER_SECOND.latin, 6);
    expect(estimateSpeechSeconds('“，。！”', 'zh')).toBe(0);
  });

  it('gives Japanese kana and kanji mixed text the measured Japanese rate', () => {
    const text = '今日は雨が降っています。街の灯りが濡れている。';
    const counted = [...text].filter((ch) => /[\p{L}\p{N}\p{M}]/u.test(ch)).length;
    expect(estimateSpeechSeconds(text)).toBeCloseTo(counted / SPEECH_CHARS_PER_SECOND.japanese, 6);
  });

  it('reads Han characters as Mandarin when the text has no kana', () => {
    const text = '雨一直下着。';
    expect(estimateSpeechSeconds(text)).toBeCloseTo(
      hanCount(text) / SPEECH_CHARS_PER_SECOND.han,
      6,
    );
  });

  it('gives Hangul and Thai their own rates', () => {
    expect(estimateSpeechSeconds('비가 내립니다', 'ko')).toBeCloseTo(
      [...'비가내립니다'].length / SPEECH_CHARS_PER_SECOND.hangul,
      6,
    );
    expect(estimateSpeechSeconds('ฝนตกหนัก', 'th')).toBeCloseTo(
      [...'ฝนตกหนัก'].length / SPEECH_CHARS_PER_SECOND.thai,
      6,
    );
  });

  it('uses the rate of each script when no language is given', () => {
    const text = 'Rain 雨';
    expect(estimateSpeechSeconds(text)).toBeCloseTo(
      4 / SPEECH_CHARS_PER_SECOND.latin + 1 / SPEECH_CHARS_PER_SECOND.han,
      6,
    );
  });

  it('applies the language rate to every character when a language is given', () => {
    expect(estimateSpeechSeconds('Hello', 'zh')).toBeCloseTo(5 / SPEECH_CHARS_PER_SECOND.han, 6);
  });

  it('gives other scripts their own rate', () => {
    expect(estimateSpeechSeconds('مرحبا', 'ar')).toBeCloseTo(5 / SPEECH_CHARS_PER_SECOND.other, 6);
    expect(estimateSpeechSeconds('مرحبا')).toBeCloseTo(5 / SPEECH_CHARS_PER_SECOND.other, 6);
  });
});

describe('estimateSpeechSecondsForChars', () => {
  it('uses the language rate for a bare count', () => {
    expect(
      estimateSpeechSecondsForChars(1_000 * SPEECH_CHARS_PER_SECOND.han, 'zh-Hans'),
    ).toBeCloseTo(1_000, 6);
    expect(estimateSpeechSecondsForChars(1_000 * SPEECH_CHARS_PER_SECOND.latin, 'en')).toBeCloseTo(
      1_000,
      6,
    );
  });

  it('uses the ADR-0003 hour (15 a second) for an unknown or missing language', () => {
    expect(estimateSpeechSecondsForChars(54_000)).toBeCloseTo(3_600, 6);
    expect(estimateSpeechSecondsForChars(15_000, 'xx')).toBeCloseTo(1_000, 6);
    expect(estimateSpeechSecondsForChars(15_000, null)).toBeCloseTo(1_000, 6);
  });

  it('makes a zh chapter three to four times as long as the same count of en characters', () => {
    const zh = estimateSpeechSecondsForChars(9_000, 'zh');
    const en = estimateSpeechSecondsForChars(9_000, 'en');
    expect(zh / en).toBeCloseTo(SPEECH_CHARS_PER_SECOND.latin / SPEECH_CHARS_PER_SECOND.han, 6);
    expect(zh / en).toBeGreaterThan(3);
    expect(zh / en).toBeLessThan(4);
  });
});

describe('speechRateForLanguage', () => {
  it('maps tags by their primary subtag', () => {
    expect(speechRateForLanguage('zh-Hans')).toBe('han');
    expect(speechRateForLanguage('pt-BR')).toBe('latin');
    expect(speechRateForLanguage('JA')).toBe('japanese');
  });

  it('returns null for a missing or unlisted language', () => {
    expect(speechRateForLanguage(null)).toBeNull();
    expect(speechRateForLanguage('')).toBeNull();
    expect(speechRateForLanguage('xx')).toBeNull();
  });

  it('has a rate for every class', () => {
    expect(Object.keys(SPEECH_CHARS_PER_SECOND).sort()).toEqual(
      ['hangul', 'han', 'japanese', 'latin', 'other', 'thai'].sort(),
    );
  });
});
