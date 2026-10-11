import { and, asc, eq, ne, sql } from 'drizzle-orm';

import { ChapterSourceSchema } from '../../core/domain';
import { parseJsonColumn } from '../json-column';
import { chapters } from '../schema';

import type { Chapter, ChapterStatus, Id } from '../../core/domain';
import type { Db } from '../types';

export type ChapterPatch = Partial<Omit<Chapter, 'id' | 'seriesId' | 'order' | 'createdAt'>>;

/** The chapters directly before and after the moved one. Null means the start or end of the series. */
export interface Neighbors {
  previousId: Id | null;
  nextId: Id | null;
}

type ChapterRow = typeof chapters.$inferSelect;

function toChapter(row: ChapterRow): Chapter {
  return {
    ...row,
    source: parseJsonColumn(ChapterSourceSchema, row.source, {
      table: 'chapters',
      column: 'source',
      id: row.id,
    }),
  };
}

export const chapterRepo = {
  insert(db: Db, row: Chapter): void {
    db.insert(chapters)
      .values({ ...row, source: JSON.stringify(row.source) })
      .run();
  },

  update(db: Db, id: string, patch: ChapterPatch): void {
    db.update(chapters)
      .set({
        ...patch,
        source: patch.source === undefined ? undefined : JSON.stringify(patch.source),
      })
      .where(eq(chapters.id, id))
      .run();
  },

  setStatus(db: Db, id: string, status: ChapterStatus, updatedAt: number): void {
    db.update(chapters).set({ status, updatedAt }).where(eq(chapters.id, id)).run();
  },

  get(db: Db, id: string): Chapter | null {
    const row = db.select().from(chapters).where(eq(chapters.id, id)).get();
    return row ? toChapter(row) : null;
  },

  listBySeries(db: Db, seriesId: string): Chapter[] {
    return db
      .select()
      .from(chapters)
      .where(eq(chapters.seriesId, seriesId))
      .orderBy(asc(chapters.order))
      .all()
      .map(toChapter);
  },

  delete(db: Db, id: string): void {
    db.delete(chapters).where(eq(chapters.id, id)).run();
  },

  /**
   * Moves a chapter between two neighbours by setting a fractional `order` (the midpoint).
   * When the gap is exhausted, the series is renumbered 1..n in the same transaction.
   * Listening positions keep their order snapshots in step with the chapters.
   */
  moveBetween(db: Db, chapterId: Id, neighbors: Neighbors, updatedAt: number): void {
    db.transaction((tx) => {
      const moved = tx
        .select({ seriesId: chapters.seriesId })
        .from(chapters)
        .where(eq(chapters.id, chapterId))
        .get();
      if (!moved) throw new Error(`Chapter ${chapterId} does not exist`);

      const siblings = tx
        .select({ id: chapters.id, order: chapters.order })
        .from(chapters)
        .where(and(eq(chapters.seriesId, moved.seriesId), ne(chapters.id, chapterId)))
        .orderBy(asc(chapters.order))
        .all();

      const indexOf = (id: Id): number => {
        const index = siblings.findIndex((s) => s.id === id);
        if (index === -1) throw new Error(`Chapter ${id} is not in the same series`);
        return index;
      };

      const insertAt =
        neighbors.previousId !== null
          ? indexOf(neighbors.previousId) + 1
          : neighbors.nextId !== null
            ? indexOf(neighbors.nextId)
            : siblings.length;
      if (
        neighbors.previousId !== null &&
        neighbors.nextId !== null &&
        indexOf(neighbors.nextId) !== insertAt
      ) {
        throw new Error('previousId and nextId must be adjacent');
      }

      const lower = insertAt > 0 ? siblings[insertAt - 1]?.order : undefined;
      const upper = insertAt < siblings.length ? siblings[insertAt]?.order : undefined;

      let order: number;
      if (lower !== undefined && upper !== undefined) {
        order = (lower + upper) / 2;
      } else if (lower !== undefined) {
        order = lower + 1;
      } else if (upper !== undefined) {
        order = upper - 1;
      } else {
        order = 0;
      }

      const gapExhausted =
        lower !== undefined && upper !== undefined && !(lower < order && order < upper);
      if (gapExhausted) {
        const ids = siblings.map((s) => s.id);
        ids.splice(insertAt, 0, chapterId);
        ids.forEach((id, i) => {
          tx.update(chapters)
            .set({ order: i + 1, updatedAt: id === chapterId ? updatedAt : undefined })
            .where(eq(chapters.id, id))
            .run();
        });
      } else {
        tx.update(chapters).set({ order, updatedAt }).where(eq(chapters.id, chapterId)).run();
      }

      tx.run(sql`
        UPDATE listening_positions SET
          current_chapter_order = (SELECT c."order" FROM chapters c WHERE c.id = listening_positions.current_chapter_id),
          furthest_chapter_order = (SELECT c."order" FROM chapters c WHERE c.id = listening_positions.furthest_chapter_id)
        WHERE series_id = ${moved.seriesId}
      `);
    });
  },
};
