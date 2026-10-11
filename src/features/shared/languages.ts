/**
 * Languages offered in series and chapter pickers. Shared by the series form, the chapter screen
 * and (once it lands) settings. Codes are BCP-47 tags, matching `LangSchema` in the domain.
 */
export interface LanguageOption {
  code: string;
  /** English name, for screen readers and secondary copy. */
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
  { code: 'pt-BR', name: 'Portuguese (Brazil)', nativeName: 'Português' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia' },
  { code: 'sv', name: 'Swedish', nativeName: 'Svenska' },
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
