import type { AudioSegment, Bookmark, ChapterPosition } from '@/core/domain';
import { playableRun } from '@/core/playback/playability';
import { audioSegmentRepo } from '@/db/repos/audio-segment-repo';
import { chapterPositionRepo, type ChapterPointInput } from '@/db/repos/chapter-position-repo';
import { chapterRepo } from '@/db/repos/chapter-repo';
import { playbackRepo, type ChapterForPlayback } from '@/db/repos/playback-repo';
import { positionRepo } from '@/db/repos/position-repo';
import { seriesRepo } from '@/db/repos/series-repo';
import type { Db } from '@/db/types';
import { readSeriesBookmarks, type BookmarkGroup } from '@/features/bookmarks/bookmark-data';
import type { BookmarkPlace } from '@/features/bookmarks/bookmark-service';
import {
  addBookmark,
  removeBookmark,
  setBookmarkNote,
} from '@/features/bookmarks/bookmark-service';

/**
 * What the playback controller needs from storage. Production wires it to the repos over the app
 * database; tests pass an in-memory version, so the controller never imports the database.
 */
export interface PlaybackData {
  /** The chapter, with only the passages that can be heard (see core/playback/playability). */
  loadChapter(chapterId: string): ChapterForPlayback | null;
  /** Where the listener stopped in one chapter, or null when it was never played. */
  chapterPosition(chapterId: string): ChapterPosition | null;
  /** The next chapter in reading order that can play, or null at the end of the series. */
  nextReadyChapterId(seriesId: string, afterOrder: number): string | null;
  /** Saves where the listener is. The series' current place and furthest place move with it. */
  savePosition(seriesId: string, chapterId: string, point: ChapterPointInput): void;
  /** Marks a chapter as heard to its end. */
  markFinished(chapterId: string, point: ChapterPointInput): void;
  /** The speed last used in a series, or null when it has none yet. */
  seriesPlaybackRate(seriesId: string): number | null;
  saveSeriesPlaybackRate(seriesId: string, rate: number): void;
  /** Segments of a chapter from `fromIdx` on, in order. */
  segmentsFrom(chapterId: string, fromIdx: number): AudioSegment[];
  /** The bookmarks of a series, grouped by chapter. */
  bookmarksOf(seriesId: string): BookmarkGroup[];
  addBookmark(place: BookmarkPlace): Bookmark;
  setBookmarkNote(bookmarkId: string, note: string): void;
  removeBookmark(bookmarkId: string): void;
}

export function createPlaybackData(db: Db): PlaybackData {
  return {
    loadChapter(chapterId) {
      const chapter = playbackRepo.getChapterForPlayback(db, chapterId);
      if (chapter === null) return null;
      return { ...chapter, segments: playableRun(chapter.segments) };
    },
    chapterPosition: (chapterId) => chapterPositionRepo.get(db, chapterId),
    nextReadyChapterId(seriesId, afterOrder) {
      const playable = audioSegmentRepo.playableChapterIds(db, seriesId);
      const next = chapterRepo
        .listBySeries(db, seriesId)
        .find((chapter) => chapter.order > afterOrder && playable.has(chapter.id));
      return next?.id ?? null;
    },
    savePosition(seriesId, chapterId, point) {
      positionRepo.record(db, seriesId, { chapterId, ...point }, Date.now());
    },
    markFinished: (chapterId, point) =>
      chapterPositionRepo.markFinished(db, chapterId, point, Date.now()),
    seriesPlaybackRate: (seriesId) => seriesRepo.getPlaybackRate(db, seriesId),
    saveSeriesPlaybackRate: (seriesId, rate) => seriesRepo.setPlaybackRate(db, seriesId, rate),
    segmentsFrom: (chapterId, fromIdx) =>
      playableRun(audioSegmentRepo.listByChapter(db, chapterId)).slice(fromIdx),
    bookmarksOf: (seriesId) => readSeriesBookmarks(db, seriesId),
    addBookmark: (place) => addBookmark({ db, now: Date.now }, place),
    setBookmarkNote: (bookmarkId, note) => setBookmarkNote(db, bookmarkId, note),
    removeBookmark: (bookmarkId) => removeBookmark(db, bookmarkId),
  };
}
