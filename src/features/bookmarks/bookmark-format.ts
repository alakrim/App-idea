/** How much of the sentence a bookmark shows in the list. */
export const SNIPPET_LENGTH = 80;
/** Longest note a bookmark keeps. Longer text is refused rather than cut without warning. */
export const NOTE_MAX_LENGTH = 500;

/** The first characters of a sentence, cut on a whole character and marked with an ellipsis. */
export function bookmarkSnippet(text: string | null, max: number = SNIPPET_LENGTH): string {
  if (text === null) return 'This sentence is no longer in the chapter';
  const trimmed = text.trim();
  const characters = Array.from(trimmed);
  if (characters.length <= max) return trimmed;
  return `${characters.slice(0, max).join('').trimEnd()}…`;
}

/**
 * A note as stored: trimmed, and null when empty. Returns null for a note over the limit, so the
 * caller can say so. The check is on characters, not bytes.
 */
export function normalizeNote(raw: string): { ok: true; note: string | null } | { ok: false } {
  const trimmed = raw.trim();
  if (Array.from(trimmed).length > NOTE_MAX_LENGTH) return { ok: false };
  return { ok: true, note: trimmed === '' ? null : trimmed };
}

/** The count line under "Bookmarks", such as "3 bookmarks". */
export function bookmarkCountLabel(count: number): string {
  if (count === 0) return 'No bookmarks yet';
  return count === 1 ? '1 bookmark' : `${count} bookmarks`;
}
