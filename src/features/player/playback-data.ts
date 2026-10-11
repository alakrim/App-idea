import type { AudioSegment, PlaybackPoint } from '@/core/domain';
import { audioSegmentRepo } from '@/db/repos/audio-segment-repo';
import { chapterRepo } from '@/db/repos/chapter-repo';
import { playbackRepo, type ChapterForPlayback } from '@/db/repos/playback-repo';
import { positionRepo } from '@/db/repos/position-repo';
import type { Db } from '@/db/types';

/**
 * What the playback controller needs from storage. Production wires it to the repos over the app
 * database; tests pass an in-memory version, so the controller never imports the database.
 */
export interface PlaybackData {
  loadChapter(chapterId: string): ChapterForPlayback | null;
  /** Where the listener is in a series, or null before anything was played. */
  currentPoint(seriesId: string): PlaybackPoint | null;
  /** The next chapter in reading order that is ready to play, or null at the end of the series. */
  nextReadyChapterId(seriesId: string, afterOrder: number): string | null;
  savePosition(seriesId: string, chapterId: string, sentenceIdx: number): void;
  /** Segments of a chapter from `fromIdx` on, in order. */
  segmentsFrom(chapterId: string, fromIdx: number): AudioSegment[];
}

export function createPlaybackData(db: Db): PlaybackData {
  return {
    loadChapter: (chapterId) => playbackRepo.getChapterForPlayback(db, chapterId),
    currentPoint: (seriesId) => positionRepo.get(db, seriesId)?.current ?? null,
    nextReadyChapterId(seriesId, afterOrder) {
      const next = chapterRepo
        .listBySeries(db, seriesId)
        .find((chapter) => chapter.order > afterOrder && chapter.status === 'ready');
      return next?.id ?? null;
    },
    savePosition(seriesId, chapterId, sentenceIdx) {
      positionRepo.record(db, seriesId, { chapterId, sentenceIdx }, Date.now());
    },
    segmentsFrom: (chapterId, fromIdx) => audioSegmentRepo.listByChapter(db, chapterId, fromIdx),
  };
}
