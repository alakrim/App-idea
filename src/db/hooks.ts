import { getTableName } from 'drizzle-orm';
import { addDatabaseChangeListener } from 'expo-sqlite';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { chapterRepo } from './repos/chapter-repo';
import { jobRepo } from './repos/job-repo';
import { seriesRepo } from './repos/series-repo';
import { chapters, jobs, series } from './schema';

import type { Chapter, Job, Series } from '../core/domain';
import type { SeriesSummary } from './repos/series-repo';
import type { Db } from './types';

/** The open, migrated database. Provided by DbProvider in src/app-shell. */
export const DbContext = createContext<Db | null>(null);

export function useDb(): Db {
  const db = useContext(DbContext);
  if (db === null) {
    throw new Error('useDb() must be used inside <DbProvider> once the library has opened.');
  }
  return db;
}

/**
 * Re-runs `read` whenever a table in `tables` changes, and returns its result. The reads are
 * synchronous, so the first render already has data.
 *
 * It listens to the same expo-sqlite change event that drizzle's `useLiveQuery` uses. drizzle needs
 * a query builder, but the repositories return validated rows (JSON columns parsed), so the SQL
 * stays in the repositories and the hooks re-run the repository read instead.
 */
function useLiveRead<T>(read: (db: Db) => T, tables: readonly string[], deps: readonly unknown[]): T {
  const db = useDb();
  const [revision, setRevision] = useState(0);
  const watched = tables.join(',');

  useEffect(() => {
    const names = new Set(watched.split(','));
    const subscription = addDatabaseChangeListener(({ tableName }) => {
      if (names.has(tableName)) {
        setRevision((current) => current + 1);
      }
    });
    return () => subscription.remove();
  }, [watched]);

  // The caller's deps decide when the read is redone, in addition to the database changing.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => read(db), [db, revision, ...deps]);
}

const SERIES_LIST_TABLES = [getTableName(series), getTableName(chapters)];
const SERIES_TABLES = [getTableName(series)];
const CHAPTER_TABLES = [getTableName(chapters)];
const JOB_TABLES = [getTableName(jobs)];

/** Library list with chapter counts and durations, most recently updated first. */
export function useSeriesList(): SeriesSummary[] {
  return useLiveRead((db) => seriesRepo.list(db), SERIES_LIST_TABLES, []);
}

export function useSeries(seriesId: string): Series | null {
  return useLiveRead((db) => seriesRepo.get(db, seriesId), SERIES_TABLES, [seriesId]);
}

/** Chapters of one series, in reading order. */
export function useChapters(seriesId: string): Chapter[] {
  return useLiveRead((db) => chapterRepo.listBySeries(db, seriesId), CHAPTER_TABLES, [seriesId]);
}

export function useChapter(chapterId: string): Chapter | null {
  return useLiveRead((db) => chapterRepo.get(db, chapterId), CHAPTER_TABLES, [chapterId]);
}

/** The pipeline jobs of one chapter, one per stage. */
export function useJobs(chapterId: string): Job[] {
  return useLiveRead((db) => jobRepo.listForChapter(db, chapterId), JOB_TABLES, [chapterId]);
}
