import type { ChapterProgress } from '@/features/pipeline/facade';
import { formatDuration } from '@/features/shared/format';

import type { ChapterRowState } from './chapter-status';

/** Shown while the first segment is not saved yet, or before the rate is known. */
export const PREPARING_COPY = 'Preparing the first minutes…';

const MS_PER_MINUTE = 60_000;

export interface ListenNow {
  label: string;
  /** A short line under the button, or null for none. */
  subtitle: string | null;
  enabled: boolean;
}

/**
 * The chapter's main button. A chapter still being made offers "Listen now" as soon as its first
 * segment is saved, with how much is ready and how long is left. Once it is ready it is plain Play.
 */
export function listenNowOf(state: ChapterRowState, progress: ChapterProgress | null): ListenNow {
  if (state === 'ready') return { label: 'Play chapter', subtitle: null, enabled: true };
  if (state !== 'processing') return { label: 'Play chapter', subtitle: null, enabled: false };
  if (!progress?.playable) {
    return { label: 'Listen now', subtitle: PREPARING_COPY, enabled: false };
  }
  return { label: 'Listen now', subtitle: progressCopy(progress), enabled: true };
}

/** "12 m ready · about 3 m left", or the preparing line until the estimate exists. */
export function progressCopy(progress: ChapterProgress): string {
  if (progress.etaMs === null) return PREPARING_COPY;
  const ready =
    progress.narratedMs < MS_PER_MINUTE ? 'Under a minute' : formatDuration(progress.narratedMs);
  const left =
    progress.etaMs < MS_PER_MINUTE
      ? 'under a minute left'
      : `about ${formatDuration(progress.etaMs)} left`;
  return `${ready} ready · ${left}`;
}
