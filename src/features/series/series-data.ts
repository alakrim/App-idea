import type { Chapter, ChapterPosition, PipelineError, Series } from '@/core/domain';
import { chapterPositionRepo } from '@/db/repos/chapter-position-repo';
import { chapterRepo } from '@/db/repos/chapter-repo';
import { jobRepo } from '@/db/repos/job-repo';
import { positionRepo } from '@/db/repos/position-repo';
import { seriesRepo } from '@/db/repos/series-repo';
import type { Db } from '@/db/types';
import { readSeriesBookmarks, type BookmarkGroup } from '@/features/bookmarks/bookmark-data';

/** Chapter length assumed for the OCR quote, since the scan has no text to count yet. */
export const OCR_QUOTE_CHARS = 30_000;

export const SERIES_SCREEN_TABLES = [
  'series',
  'chapters',
  'jobs',
  'listening_positions',
  'chapter_positions',
  'bookmarks',
];

export interface ChapterRecord {
  chapter: Chapter;
  /** The error of the stage that stopped the chapter, if it is failed. */
  failure: PipelineError | null;
  /** Where the listener stopped in this chapter, or null when it was never played. */
  listening: ChapterPosition | null;
}

export interface SeriesScreenData {
  series: Series | null;
  chapters: ChapterRecord[];
  /** The chapter the listener was last on in this series. */
  resumeChapterId: string | null;
  /** The series' bookmarks, grouped by chapter. */
  bookmarks: BookmarkGroup[];
}

export function readSeriesScreen(db: Db, seriesId: string): SeriesScreenData {
  const series = seriesRepo.get(db, seriesId);
  if (series === null) {
    return { series: null, chapters: [], resumeChapterId: null, bookmarks: [] };
  }

  const ordered = chapterRepo.listBySeries(db, seriesId);
  const positions = chapterPositionRepo.getMany(
    db,
    ordered.map((chapter) => chapter.id),
  );
  const chapters = ordered.map((chapter) => ({
    chapter,
    failure: chapter.status === 'failed' ? lastFailure(db, chapter.id) : null,
    listening: positions.get(chapter.id) ?? null,
  }));
  return {
    series,
    chapters,
    resumeChapterId: positionRepo.get(db, seriesId)?.current.chapterId ?? null,
    bookmarks: readSeriesBookmarks(db, seriesId),
  };
}

function lastFailure(db: Db, chapterId: string): PipelineError | null {
  const failed = jobRepo.listForChapter(db, chapterId).find((job) => job.status === 'failed');
  return failed?.error ?? null;
}

export interface PlayTarget {
  chapterId: string;
  /** True when it resumes the chapter last played, so the button reads "Continue". */
  resume: boolean;
}

/** Resume the last chapter if it is playable, else the first playable one. Null when none is ready. */
export function playTarget(
  chapters: readonly ChapterRecord[],
  resumeChapterId: string | null,
): PlayTarget | null {
  const ready = chapters.filter((record) => record.chapter.status === 'ready');
  const resume = ready.find((record) => record.chapter.id === resumeChapterId);
  if (resume) return { chapterId: resume.chapter.id, resume: true };
  const first = ready[0];
  return first ? { chapterId: first.chapter.id, resume: false } : null;
}
