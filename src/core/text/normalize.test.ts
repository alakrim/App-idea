import { normalizeWhitespace } from './normalize';

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
