import { desc, eq, getTableColumns, sql } from 'drizzle-orm';

import { chapters, series } from '../schema';

import type { Series } from '../../core/domain';
import type { Db } from '../types';

export type SeriesPatch = Partial<Omit<Series, 'id' | 'createdAt'>>;

export interface SeriesSummary extends Series {
  chapterCount: number;
  totalDurationMs: number;
}

export const seriesRepo = {
  insert(db: Db, row: Series): void {
    db.insert(series).values(row).run();
  },

  update(db: Db, id: string, patch: SeriesPatch): void {
    db.update(series).set(patch).where(eq(series.id, id)).run();
  },

  /** Deletes the series and, by cascade, its chapters, text, analysis, jobs and positions. */
  delete(db: Db, id: string): void {
    db.delete(series).where(eq(series.id, id)).run();
  },

  get(db: Db, id: string): Series | null {
    return db.select().from(series).where(eq(series.id, id)).get() ?? null;
  },

  /** Library list, most recently updated first. Durations are summed over chapters that have one. */
  list(db: Db): SeriesSummary[] {
    return db
      .select({
        ...getTableColumns(series),
        chapterCount: sql<number>`count(${chapters.id})`,
        totalDurationMs: sql<number>`coalesce(sum(${chapters.durationMs}), 0)`,
      })
      .from(series)
      .leftJoin(chapters, eq(chapters.seriesId, series.id))
      .groupBy(series.id)
      .orderBy(desc(series.updatedAt))
      .all();
  },
};
