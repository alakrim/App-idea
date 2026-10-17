import { eq } from 'drizzle-orm';

import { chapterPositionRepo } from './chapter-position-repo';
import { chapters, listeningPositions } from '../schema';

import type { ListeningPosition, PlaybackPoint } from '../../core/domain';
import type { Db } from '../types';

export interface PositionInput {
  chapterId: string;
  sentenceIdx: number;
  /** Media time within the chapter, saved with the chapter's own resume point. */
  positionMs: number;
}

type PositionRow = typeof listeningPositions.$inferSelect;

function isBeyond(a: PlaybackPoint, b: PlaybackPoint): boolean {
  if (a.chapterOrder !== b.chapterOrder) return a.chapterOrder > b.chapterOrder;
  return a.sentenceIdx > b.sentenceIdx;
}

function toPosition(row: PositionRow): ListeningPosition {
  return {
    seriesId: row.seriesId,
    current: {
      chapterId: row.currentChapterId,
      chapterOrder: row.currentChapterOrder,
      sentenceIdx: row.currentSentenceIdx,
    },
    furthest: {
      chapterId: row.furthestChapterId,
      chapterOrder: row.furthestChapterOrder,
      sentenceIdx: row.furthestSentenceIdx,
    },
    updatedAt: row.updatedAt,
  };
}

export const positionRepo = {
  get(db: Db, seriesId: string): ListeningPosition | null {
    const row = db
      .select()
      .from(listeningPositions)
      .where(eq(listeningPositions.seriesId, seriesId))
      .get();
    return row ? toPosition(row) : null;
  },

  /**
   * Records where the listener is now, in the series and in that chapter, in one transaction.
   * `furthest` only moves forward, so it stays the spoiler cutoff even after a seek back or a visit
   * to an earlier chapter. The chapter order is read here, never trusted from the caller.
   */
  record(db: Db, seriesId: string, point: PositionInput, updatedAt: number): ListeningPosition {
    return db.transaction((tx) => {
      const chapter = tx
        .select({ seriesId: chapters.seriesId, order: chapters.order })
        .from(chapters)
        .where(eq(chapters.id, point.chapterId))
        .get();
      if (!chapter || chapter.seriesId !== seriesId) {
        throw new Error(`Chapter ${point.chapterId} is not in series ${seriesId}`);
      }

      const current: PlaybackPoint = {
        chapterId: point.chapterId,
        chapterOrder: chapter.order,
        sentenceIdx: point.sentenceIdx,
      };
      const existing = tx
        .select()
        .from(listeningPositions)
        .where(eq(listeningPositions.seriesId, seriesId))
        .get();
      const previousFurthest = existing ? toPosition(existing).furthest : null;
      const furthest =
        previousFurthest !== null && !isBeyond(current, previousFurthest)
          ? previousFurthest
          : current;

      const values = {
        seriesId,
        currentChapterId: current.chapterId,
        currentChapterOrder: current.chapterOrder,
        currentSentenceIdx: current.sentenceIdx,
        furthestChapterId: furthest.chapterId,
        furthestChapterOrder: furthest.chapterOrder,
        furthestSentenceIdx: furthest.sentenceIdx,
        updatedAt,
      };
      tx.insert(listeningPositions)
        .values(values)
        .onConflictDoUpdate({ target: listeningPositions.seriesId, set: values })
        .run();
      chapterPositionRepo.save(
        tx,
        point.chapterId,
        { sentenceIdx: point.sentenceIdx, positionMs: point.positionMs },
        updatedAt,
      );

      return toPosition({ ...values });
    });
  },
};
