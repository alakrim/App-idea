import { chapterRepo } from '@/db/repos/chapter-repo';
import { positionRepo } from '@/db/repos/position-repo';
import { seriesRepo, type SeriesSummary } from '@/db/repos/series-repo';

import type { Db } from '@/db/types';

export type LibrarySort = 'recent' | 'title';

/** Where listening stands in one series. Null on the entry means nothing has been played. */
export interface ListeningState {
  chapterId: string;
  chapterTitle: string;
  /** 1-based position of the chapter in the series. */
  chapterNumber: number;
  chapterCount: number;
  /** Share of the series reached, 0..1. The chapter being heard counts as reached. */
  reachedShare: number;
  /** When the listener was last on this series. Drives "Continue listening". */
  updatedAt: number;
}

export interface LibraryEntry {
  series: SeriesSummary;
  listening: ListeningState | null;
}

/** Every series with its chapter totals and listening state, most recently updated first. */
export function readLibrary(db: Db): LibraryEntry[] {
  return seriesRepo.list(db).map((series) => ({
    series,
    listening: listeningStateFor(db, series.id),
  }));
}

function listeningStateFor(db: Db, seriesId: string): ListeningState | null {
  const position = positionRepo.get(db, seriesId);
  if (position === null) return null;

  const chapters = chapterRepo.listBySeries(db, seriesId);
  const index = chapters.findIndex((chapter) => chapter.id === position.current.chapterId);
  const chapter = chapters[index];
  if (index < 0 || chapter === undefined) return null;

  return {
    chapterId: chapter.id,
    chapterTitle: chapter.title,
    chapterNumber: index + 1,
    chapterCount: chapters.length,
    reachedShare: (index + 1) / chapters.length,
    updatedAt: position.updatedAt,
  };
}

/** The series the listener was on most recently, or null when nothing has been played. */
export function continueListening(entries: readonly LibraryEntry[]): LibraryEntry | null {
  let best: LibraryEntry | null = null;
  for (const entry of entries) {
    const updatedAt = entry.listening?.updatedAt;
    if (updatedAt === undefined) continue;
    if (best === null || updatedAt > (best.listening?.updatedAt ?? Number.NEGATIVE_INFINITY)) {
      best = entry;
    }
  }
  return best;
}

const titleOrder = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** Returns a sorted copy. "recent" keeps the repository order (most recently updated first). */
export function sortLibrary(entries: readonly LibraryEntry[], sort: LibrarySort): LibraryEntry[] {
  const copy = [...entries];
  if (sort === 'title') {
    return copy.sort((a, b) => titleOrder.compare(a.series.title, b.series.title));
  }
  return copy;
}
