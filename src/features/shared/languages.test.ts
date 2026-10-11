import { findLanguage, languagePairLabel, nativeLanguageName } from './languages';

describe('languages', () => {
  it('finds a language by its tag and returns null for none', () => {
    expect(findLanguage('it')?.nativeName).toBe('Italiano');
    expect(findLanguage(null)).toBeNull();
  });

  it('falls back to the raw tag for an unknown language', () => {
    expect(nativeLanguageName('xx-unknown')).toBe('xx-unknown');
  });

  it('builds the pair badge only when both languages are set', () => {
    expect(languagePairLabel('zh-Hans', 'it')).toBe('中文 → Italiano');
    expect(languagePairLabel('zh-Hans', null)).toBeNull();
    expect(languagePairLabel(null, 'it')).toBeNull();
  });
});
