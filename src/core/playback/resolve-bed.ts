import {
  type AmbienceEra,
  bedEraOf,
  bedFitsEra,
  fallbackChain,
  getCategory,
} from '../analysis/ambience-taxonomy';

/**
 * Picks the bed to play for an ambience category (ADR-0005). Order: the category's own bed first (a
 * real Freesound recording is installed under its category id, A3), then the taxonomy fallback chain
 * in order. The chain ends in a base-pack id, or in null, which skips the cue.
 *
 * `installed` holds every playable bed id: base-pack ids and real bed ids (category ids).
 * `chapterEra` (A4) is the era of the chapter being played, or null when it is unknown. A bed whose
 * era conflicts with it is never returned: the walk goes on along the chain, and the cue is skipped
 * when no era-safe bed is installed. Without an era, every installed bed is allowed.
 *
 * Returns the id to play, or null when nothing on the chain is installed and era-safe, or the id is unknown.
 */
export function resolveBed(
  categoryId: string,
  installed: ReadonlySet<string>,
  chapterEra: AmbienceEra | null = null,
): string | null {
  const playable = (id: string): boolean => {
    if (!installed.has(id)) return false;
    if (chapterEra === null) return true;
    const era = bedEraOf(id);
    return era !== undefined && bedFitsEra(era, chapterEra);
  };
  if (playable(categoryId)) return categoryId;
  if (getCategory(categoryId) === undefined) return null;
  return fallbackChain(categoryId).find(playable) ?? null;
}
