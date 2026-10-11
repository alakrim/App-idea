/**
 * Collapses every run of Unicode whitespace into a single ASCII space and trims both ends.
 * It never inserts characters between existing ones, so CJK text, emoji and surrogate pairs
 * pass through unchanged apart from their whitespace.
 */
export function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/gu, ' ').trim();
}
