/**
 * Languages offered in the series, chapter, translation and vocab pickers. One list for the whole
 * app. Codes are BCP-47 tags, matching `LangSchema` in the domain.
 */
export interface LanguageOption {
  code: string;
  /** English name, for screen readers, search and secondary copy. */
  name: string;
  /** The language's own name, which is what badges show. */
  nativeName: string;
}

export const LANGUAGES: readonly LanguageOption[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'zh-Hans', name: 'Chinese (Simplified)', nativeName: '中文' },
  { code: 'zh-Hant', name: 'Chinese (Traditional)', nativeName: '繁體中文' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'pt-BR', name: 'Portuguese (Brazil)', nativeName: 'Português (Brasil)' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands' },
  { code: 'sv', name: 'Swedish', nativeName: 'Svenska' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский' },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia' },
];

export function findLanguage(code: string | null): LanguageOption | null {
  if (code === null) return null;
  return LANGUAGES.find((language) => language.code === code) ?? null;
}

/** The language's own name, or the raw tag when it is not in the list. */
export function nativeLanguageName(code: string): string {
  return findLanguage(code)?.nativeName ?? code;
}

/** "中文 → Italiano" for a series with both languages set. Null when either one is missing. */
export function languagePairLabel(
  sourceLang: string | null,
  targetLang: string | null,
): string | null {
  if (sourceLang === null || targetLang === null) return null;
  return `${nativeLanguageName(sourceLang)} → ${nativeLanguageName(targetLang)}`;
}

/**
 * Case-insensitive match on the native name, the English name and the code. Every word in the
 * query must match somewhere, so "port bra" finds Português (Brazil).
 */
export function filterLanguages(
  options: readonly LanguageOption[],
  query: string,
): readonly LanguageOption[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return options;
  return options.filter((option) => {
    const haystack = `${option.nativeName} ${option.name} ${option.code}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

/** The native name for a target language, or Off when translation is switched off. */
export function languageLabel(code: string | null): string {
  if (code === null) return 'Off';
  return nativeLanguageName(code);
}
