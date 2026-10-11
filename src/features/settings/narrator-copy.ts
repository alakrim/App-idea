import type { NarratorOption } from '@/core/narration/options';
import { primaryLanguage } from '@/core/narration/voices';
import { LANGUAGES } from '@/features/shared/languages';

import { hourlyNarrationCost } from './narration-choices';

import type { CatalogState } from './model-catalog';

/*
 * The words and numbers on a narrator card. Pure, so every state of the price line and the
 * language line is testable without a screen.
 */

export type NarratorPrice =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'unlisted' }
  | { status: 'known'; usdPerHour: number };

/** The live price of a narrator from the catalogue. Unknown until the catalogue has loaded. */
export function narratorPrice(option: NarratorOption, catalog: CatalogState): NarratorPrice {
  if (catalog.status === 'loading') return { status: 'loading' };
  if (catalog.status === 'unavailable') return { status: 'unavailable' };
  const model = catalog.models.find((entry) => entry.id === option.modelId);
  if (!model) return { status: 'unlisted' };
  return { status: 'known', usdPerHour: hourlyNarrationCost(model) };
}

/** Half a cent: anything below it is shown as a bound, not as a rounded figure. */
const UNDER_ONE_CENT = 0.005;

export function priceLabel(price: NarratorPrice): string {
  switch (price.status) {
    case 'loading':
      return 'Checking the price…';
    case 'unavailable':
      return 'Price unavailable right now';
    case 'unlisted':
      return 'Not offered right now';
    case 'known':
      if (price.usdPerHour <= 0) return 'Free';
      if (price.usdPerHour < UNDER_ONE_CENT) return 'Under $0.01 per hour';
      return `About $${price.usdPerHour.toFixed(2)} per hour`;
  }
}

/** The short English name of a language tag: "Portuguese" for pt-BR, "Chinese" for zh. */
export function shortLanguageName(code: string): string {
  const exact = LANGUAGES.find((language) => language.code === code);
  const family = LANGUAGES.find(
    (language) => primaryLanguage(language.code) === primaryLanguage(code),
  );
  const name = (exact ?? family)?.name ?? code;
  return name.replace(/\s*\(.*\)$/, '');
}

/** "All languages", or the list of the languages a narrator speaks. */
export function languageLine(option: NarratorOption): string {
  if (option.languages === 'multi') return 'All languages';
  const names = option.languages.map(shortLanguageName);
  return `${names.length} languages: ${names.join(', ')}`;
}

export function unsupportedLabel(lang: string): string {
  return `Not available for ${shortLanguageName(lang)}`;
}
