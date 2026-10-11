import {
  filterLanguages,
  findLanguage,
  LANGUAGES,
  languageLabel,
  languagePairLabel,
  nativeLanguageName,
} from './languages';

describe('language list', () => {
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

  it('matches native and English names, and every typed word must match', () => {
    const codes = (query: string) => filterLanguages(LANGUAGES, query).map((o) => o.code);
    expect(codes('port bra')).toEqual(['pt-BR']);
    expect(codes('italiano')).toEqual(['it']);
    expect(codes('JAPANESE')).toEqual(['ja']);
  });

  it('returns the full list for an empty query', () => {
    expect(filterLanguages(LANGUAGES, '   ')).toHaveLength(LANGUAGES.length);
  });

  it('shows the native name, and Off for no translation', () => {
    expect(languageLabel('it')).toBe('Italiano');
    expect(languageLabel(null)).toBe('Off');
  });

  it('has one entry per code', () => {
    const codes = LANGUAGES.map((language) => language.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
