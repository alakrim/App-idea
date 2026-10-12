import { fallbackChain, getCategory } from '../analysis/ambience-taxonomy';

/**
 * Picks the bed to play for an ambience category (ADR-0005). Order: the category's own bed first (a
 * real Freesound recording is installed under its category id, A3), then the taxonomy fallback chain
 * in order. The chain ends in a base-pack id, or in null, which skips the cue.
 *
 * `installed` holds every playable bed id: base-pack ids and real bed ids (category ids).
 * Returns the id to play, or null when nothing on the chain is installed or the id is unknown.
 */
export function resolveBed(categoryId: string, installed: ReadonlySet<string>): string | null {
  if (installed.has(categoryId)) return categoryId;
  if (getCategory(categoryId) === undefined) return null;
  return fallbackChain(categoryId).find((id) => installed.has(id)) ?? null;
}
