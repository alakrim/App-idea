import { detectScript, normalizeText, normalizeWhitespace, scriptOfCodePoint } from './normalize';

describe('normalizeWhitespace', () => {
  it('collapses spaces, tabs and line breaks into single spaces and trims', () => {
    expect(normalizeWhitespace('  hello \t\n   world  ')).toBe('hello world');
  });

  it('returns an empty string for whitespace-only input', () => {
    expect(normalizeWhitespace(' \n\t  ')).toBe('');
  });

  it('collapses the ideographic space used in CJK text', () => {
    expect(normalizeWhitespace('東京　　タワー')).toBe('東京 タワー');
  });

  it('leaves CJK text without extra whitespace unchanged', () => {
    expect(normalizeWhitespace('日本語のテキスト、漢字かな交じり文。')).toBe(
      '日本語のテキスト、漢字かな交じり文。',
    );
  });

  it('keeps emoji and surrogate pairs intact', () => {
    expect(normalizeWhitespace('🙂   テスト  🎧')).toBe('🙂 テスト 🎧');
  });
});

describe('normalizeText', () => {
  it('composes decomposed characters to NFC', () => {
    expect(normalizeText('Café')).toBe('Café');
  });

  it('unifies CRLF and CR line breaks to LF', () => {
    expect(normalizeText('one\r\ntwo\rthree')).toBe('one\ntwo\nthree');
  });

  it('strips zero-width spaces, soft hyphens, bidi marks and the BOM', () => {
    expect(normalizeText('﻿wo­rd​ ‏end⁠')).toBe('word end');
  });

  it('keeps ZWJ and ZWNJ because they carry meaning in emoji and Persian', () => {
    expect(normalizeText('👨‍👩')).toBe('👨‍👩');
    expect(normalizeText('می‌خواهم')).toBe('می‌خواهم');
  });

  it('turns non-breaking and typographic spaces into ordinary spaces', () => {
    expect(normalizeText('a b c d')).toBe('a b c d');
  });

  it('turns tabs and runs of spaces into one space but keeps single line breaks', () => {
    expect(normalizeText('a \t  b\n  c')).toBe('a b\nc');
  });

  it('removes spaces around line breaks', () => {
    expect(normalizeText('first   \n   second')).toBe('first\nsecond');
  });

  it('collapses three or more newlines into one blank line', () => {
    expect(normalizeText('a\n\n\n\n\nb')).toBe('a\n\nb');
    expect(normalizeText('a\n \n \n\nb')).toBe('a\n\nb');
  });

  it('maps prime marks to apostrophe and straight double quote', () => {
    expect(normalizeText('it′s ″quoted″')).toBe(`it's "quoted"`);
  });

  it('leaves curly quotes and CJK punctuation untouched', () => {
    const input = '“你好。”「こんにちは！」『再见』（注）';
    expect(normalizeText(input)).toBe(input);
  });

  it('trims the result', () => {
    expect(normalizeText('\n\n  text  \n\n')).toBe('text');
  });

  it('is idempotent', () => {
    const messy = '﻿ Café\r\n\r\n\r\n  “quoted” 。\t tail \n';
    const once = normalizeText(messy);
    expect(normalizeText(once)).toBe(once);
  });
});

describe('scriptOfCodePoint', () => {
  it.each([
    ['A', 'latin'],
    ['é', 'latin'],
    ['Ж', 'cyrillic'],
    ['ع', 'arabic'],
    ['ก', 'thai'],
    ['漢', 'cjk'],
    ['か', 'cjk'],
    ['한', 'cjk'],
    ['α', null],
    ['1', null],
    ['。', null],
    [' ', null],
  ])('classifies %s as %s', (ch, expected) => {
    expect(scriptOfCodePoint(ch.codePointAt(0) ?? 0)).toBe(expected);
  });

  it('does not count the multiplication sign as a Latin letter', () => {
    expect(scriptOfCodePoint(0xd7)).toBeNull();
  });
});

describe('detectScript', () => {
  it('detects Latin prose', () => {
    expect(detectScript('The quick brown fox jumps.')).toBe('latin');
  });

  it('detects Chinese, Japanese and Korean as cjk', () => {
    expect(detectScript('雨下了整整一夜。')).toBe('cjk');
    expect(detectScript('本須は言った。')).toBe('cjk');
    expect(detectScript('그는 떠났다.')).toBe('cjk');
  });

  it('detects Cyrillic, Arabic and Thai', () => {
    expect(detectScript('Привет, мир')).toBe('cyrillic');
    expect(detectScript('مرحبا بالعالم')).toBe('arabic');
    expect(detectScript('สวัสดีครับ')).toBe('thai');
  });

  it('uses the majority script of a mixed text', () => {
    expect(detectScript('Tokyo Tower 東京タワー is tall')).toBe('latin');
    expect(detectScript('東京タワーはTokyo')).toBe('cjk');
  });

  it('returns other when there are no letters from the supported scripts', () => {
    expect(detectScript('12345 !?')).toBe('other');
    expect(detectScript('')).toBe('other');
  });
});
