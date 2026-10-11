import { getCategory } from '@/core/analysis/ambience-taxonomy';

/**
 * Ambience category ids to words, for an id the taxonomy does not know. Known ids use their
 * taxonomy label, so "tavern_crowd" reads "Tavern". The ids are stable and stored, so only the
 * display text changes here.
 */
export function humanizeCategory(categoryId: string): string {
  const words = categoryId
    .split('_')
    .filter((word) => word.length > 0)
    .join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The display name for a category: its taxonomy label, or a humanized id when unknown. */
export function ambienceLabel(categoryId: string): string {
  return getCategory(categoryId)?.label ?? humanizeCategory(categoryId);
}
