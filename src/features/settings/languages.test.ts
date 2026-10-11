import { filterLanguages, LANGUAGE_OPTIONS, languageLabel } from './languages';

describe('language list', () => {
  it('matches native and English names, and every typed word must match', () => {
    const names = filterLanguages(LANGUAGE_OPTIONS, 'port bra').map((option) => option.code);
    expect(names).toEqual(['pt-BR']);
    expect(filterLanguages(LANGUAGE_OPTIONS, 'italiano').map((o) => o.code)).toEqual(['it']);
    expect(filterLanguages(LANGUAGE_OPTIONS, 'JAPANESE').map((o) => o.code)).toEqual(['ja']);
  });

  it('returns the full list for an empty query', () => {
    expect(filterLanguages(LANGUAGE_OPTIONS, '   ')).toHaveLength(LANGUAGE_OPTIONS.length);
  });

  it('shows the native name, and Off for no translation', () => {
    expect(languageLabel('it')).toBe('Italiano');
    expect(languageLabel(null)).toBe('Off');
  });
});
