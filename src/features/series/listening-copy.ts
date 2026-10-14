import type { ListeningProgress } from '@/core/playback/listening-progress';

const MS_PER_MINUTE = 60_000;

/** Whole minutes left, rounded. Under half a minute reads as none, so "under a minute" covers it. */
function minutesLeft(remainingMs: number): number {
  return Math.round(remainingMs / MS_PER_MINUTE);
}

/** The short label a chapter row shows, such as "12 min left". Null when there is nothing to say. */
export function listeningShortLabel(progress: ListeningProgress): string | null {
  switch (progress.kind) {
    case 'unstarted':
      return null;
    case 'finished':
      return 'Finished';
    case 'in-progress': {
      if (progress.remainingMs === null) return null;
      const minutes = minutesLeft(progress.remainingMs);
      return minutes < 1 ? 'Under a minute left' : `${minutes} min left`;
    }
  }
}

/** The same state as a screen reader says it, such as "12 minutes left". Null when silent. */
export function listeningSpokenLabel(progress: ListeningProgress): string | null {
  switch (progress.kind) {
    case 'unstarted':
      return null;
    case 'finished':
      return 'finished';
    case 'in-progress': {
      if (progress.remainingMs === null) return null;
      const minutes = minutesLeft(progress.remainingMs);
      if (minutes < 1) return 'less than a minute left';
      return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} left`;
    }
  }
}
