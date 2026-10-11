/** Languages offered as a default translation target. Native names are shown beside English ones. */
export interface LanguageOption {
  /** BCP-47 tag, stored in settings.defaultTargetLang. */
  code: string;
  nativeName: string;
  englishName: string;
}

export const LANGUAGE_OPTIONS: readonly LanguageOption[] = [
  { code: 'en', nativeName: 'English', englishName: 'English' },
  { code: 'it', nativeName: 'Italiano', englishName: 'Italian' },
  { code: 'pt-BR', nativeName: 'Português (Brasil)', englishName: 'Portuguese (Brazil)' },
  { code: 'pt', nativeName: 'Português', englishName: 'Portuguese' },
  { code: 'es', nativeName: 'Español', englishName: 'Spanish' },
  { code: 'fr', nativeName: 'Français', englishName: 'French' },
  { code: 'de', nativeName: 'Deutsch', englishName: 'German' },
  { code: 'nl', nativeName: 'Nederlands', englishName: 'Dutch' },
  { code: 'sv', nativeName: 'Svenska', englishName: 'Swedish' },
  { code: 'pl', nativeName: 'Polski', englishName: 'Polish' },
  { code: 'ru', nativeName: 'Русский', englishName: 'Russian' },
  { code: 'uk', nativeName: 'Українська', englishName: 'Ukrainian' },
  { code: 'tr', nativeName: 'Türkçe', englishName: 'Turkish' },
  { code: 'ar', nativeName: 'العربية', englishName: 'Arabic' },
  { code: 'hi', nativeName: 'हिन्दी', englishName: 'Hindi' },
  { code: 'ja', nativeName: '日本語', englishName: 'Japanese' },
  { code: 'ko', nativeName: '한국어', englishName: 'Korean' },
  { code: 'zh-CN', nativeName: '简体中文', englishName: 'Chinese (Simplified)' },
  { code: 'zh-TW', nativeName: '繁體中文', englishName: 'Chinese (Traditional)' },
  { code: 'th', nativeName: 'ไทย', englishName: 'Thai' },
  { code: 'vi', nativeName: 'Tiếng Việt', englishName: 'Vietnamese' },
  { code: 'id', nativeName: 'Bahasa Indonesia', englishName: 'Indonesian' },
];

/**
 * Case-insensitive match on the native name, the English name and the code. Every word in the
 * query must match somewhere, so "port bra" finds Português (Brasil).
 */
export function filterLanguages(
  options: readonly LanguageOption[],
  query: string,
): readonly LanguageOption[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return options;
  return options.filter((option) => {
    const haystack = `${option.nativeName} ${option.englishName} ${option.code}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

export function languageLabel(code: string | null): string {
  if (code === null) return 'Off';
  const match = LANGUAGE_OPTIONS.find((option) => option.code === code);
  return match ? match.nativeName : code;
}
