/**
 * A chapter counts as unfinished again once the listener plays past this point. Until then, a
 * finished chapter keeps its mark, so a restart to hear it again does not undo it at once.
 */
export const UNFINISHED_AFTER_MS = 5000;

/** The completed flag after a save: it stays set only while the listener is still near the start. */
export function nextCompleted(wasCompleted: boolean, positionMs: number): boolean {
  return wasCompleted && positionMs <= UNFINISHED_AFTER_MS;
}

export interface SavedChapterPosition {
  positionMs: number;
  completed: boolean;
}

/**
 * What a chapter row shows. `unstarted` has no bar. `in-progress` has a fraction of the chapter
 * heard, and `remainingMs` when the chapter's length is known. `finished` shows a check.
 */
export type ListeningProgress =
  | { kind: 'unstarted' }
  | { kind: 'finished' }
  | { kind: 'in-progress'; fraction: number; remainingMs: number | null };

/** Progress through one chapter, from its saved position and its length. */
export function listeningProgress(
  durationMs: number | null,
  position: SavedChapterPosition | null,
): ListeningProgress {
  if (position === null) return { kind: 'unstarted' };
  if (position.completed) return { kind: 'finished' };
  if (position.positionMs === 0) return { kind: 'unstarted' };
  if (durationMs === null || durationMs <= 0) {
    return { kind: 'in-progress', fraction: 0, remainingMs: null };
  }
  const fraction = Math.min(1, Math.max(0, position.positionMs / durationMs));
  return {
    kind: 'in-progress',
    fraction,
    remainingMs: Math.max(0, durationMs - position.positionMs),
  };
}
