import { desc, eq, sql } from 'drizzle-orm';

import { chapters, series } from '../schema';

import type { Series } from '../../core/domain';
import type { Db } from '../types';

export type SeriesPatch = Partial<Omit<Series, 'id' | 'createdAt'>>;

/**
 * The Series columns. The speed column is left out on purpose: it is read and written through
 * getPlaybackRate and setPlaybackRate, so every Series read has exactly the domain shape.
 */
const seriesColumns = {
  id: series.id,
  title: series.title,
  coverUri: series.coverUri,
  coverTint: series.coverTint,
  sourceLang: series.sourceLang,
  targetLang: series.targetLang,
  narrationProfileId: series.narrationProfileId,
  createdAt: series.createdAt,
  updatedAt: series.updatedAt,
};

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
    return db.select(seriesColumns).from(series).where(eq(series.id, id)).get() ?? null;
  },

  /** The speed last used in the series, or null when none was saved. Kept out of the Series row type. */
  getPlaybackRate(db: Db, id: string): number | null {
    const row = db
      .select({ playbackRate: series.playbackRate })
      .from(series)
      .where(eq(series.id, id))
      .get();
    return row?.playbackRate ?? null;
  },

  setPlaybackRate(db: Db, id: string, rate: number): void {
    db.update(series).set({ playbackRate: rate }).where(eq(series.id, id)).run();
  },

  /** Library list, most recently updated first. Durations are summed over chapters that have one. */
  list(db: Db): SeriesSummary[] {
    return db
      .select({
        ...seriesColumns,
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
