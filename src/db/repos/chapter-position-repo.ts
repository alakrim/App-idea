import { eq, inArray } from 'drizzle-orm';

import { nextCompleted } from '../../core/playback/listening-progress';
import { chapterPositions, chapters } from '../schema';

import type { ChapterPosition } from '../../core/domain';
import type { Db } from '../types';

export interface ChapterPointInput {
  sentenceIdx: number;
  positionMs: number;
}

type ChapterPositionRow = typeof chapterPositions.$inferSelect;

function toChapterPosition(row: ChapterPositionRow): ChapterPosition {
  return {
    chapterId: row.chapterId,
    sentenceIdx: row.sentenceIdx,
    positionMs: row.positionMs,
    completed: row.completed,
    updatedAt: row.updatedAt,
  };
}

/** Each chapter's own resume point, read and written with the series position. */
export const chapterPositionRepo = {
  get(db: Db, chapterId: string): ChapterPosition | null {
    const row = db
      .select()
      .from(chapterPositions)
      .where(eq(chapterPositions.chapterId, chapterId))
      .get();
    return row ? toChapterPosition(row) : null;
  },

  /** The saved positions of the given chapters, keyed by chapter id. Chapters never played are absent. */
  getMany(db: Db, chapterIds: readonly string[]): Map<string, ChapterPosition> {
    if (chapterIds.length === 0) return new Map();
    const rows = db
      .select()
      .from(chapterPositions)
      .where(inArray(chapterPositions.chapterId, [...chapterIds]))
      .all();
    return new Map(rows.map((row) => [row.chapterId, toChapterPosition(row)]));
  },

  /**
   * Saves where the listener is in a chapter. A finished chapter stays finished until the listener
   * plays past the start again, so a replay from the top does not clear the mark at once.
   */
  save(db: Db, chapterId: string, point: ChapterPointInput, updatedAt: number): void {
    const existing = chapterPositionRepo.get(db, chapterId);
    const completed = nextCompleted(existing?.completed ?? false, point.positionMs);
    upsert(db, chapterId, { ...point, completed }, updatedAt);
  },

  /** Marks a chapter as heard to its end. Its place is kept at the end, as the last saved point. */
  markFinished(db: Db, chapterId: string, point: ChapterPointInput, updatedAt: number): void {
    const chapter = db
      .select({ id: chapters.id })
      .from(chapters)
      .where(eq(chapters.id, chapterId))
      .get();
    if (!chapter) throw new Error(`Chapter ${chapterId} does not exist`);
    upsert(db, chapterId, { ...point, completed: true }, updatedAt);
  },
};

function upsert(
  db: Db,
  chapterId: string,
  values: ChapterPointInput & { completed: boolean },
  updatedAt: number,
): void {
  const row = { chapterId, ...values, updatedAt };
  db.insert(chapterPositions)
    .values(row)
    .onConflictDoUpdate({
      target: chapterPositions.chapterId,
      set: {
        sentenceIdx: values.sentenceIdx,
        positionMs: values.positionMs,
        completed: values.completed,
        updatedAt,
      },
    })
    .run();
}
