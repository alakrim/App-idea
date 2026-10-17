import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import { PipelineErrorSchema } from '../../core/domain';
import { parseJsonColumn } from '../json-column';
import { jobs } from '../schema';

import type { Job, JobStatus, Stage } from '../../core/domain';
import type { Db } from '../types';

type JobRow = typeof jobs.$inferSelect;

function toJob(row: JobRow): Job {
  return {
    ...row,
    error:
      row.error === null
        ? null
        : parseJsonColumn(PipelineErrorSchema, row.error, {
            table: 'jobs',
            column: 'error',
            id: row.id,
          }),
  };
}

const UNFINISHED: JobStatus[] = ['pending', 'running'];

/** Every status, so a count is 0 rather than missing when no job has it. */
const ALL_STATUSES: readonly JobStatus[] = [
  'pending',
  'running',
  'done',
  'failed',
  'skipped',
  'cancelled',
];

export const jobRepo = {
  /** One job per (chapter, stage). Writing again replaces the row, so each stage is resumable. */
  upsert(db: Db, job: Job): void {
    const values = {
      ...job,
      error: job.error === null ? null : JSON.stringify(job.error),
    };
    db.insert(jobs)
      .values(values)
      .onConflictDoUpdate({ target: [jobs.chapterId, jobs.stage], set: values })
      .run();
  },

  get(db: Db, chapterId: string, stage: Stage): Job | null {
    const row = db
      .select()
      .from(jobs)
      .where(and(eq(jobs.chapterId, chapterId), eq(jobs.stage, stage)))
      .get();
    return row ? toJob(row) : null;
  },

  listForChapter(db: Db, chapterId: string): Job[] {
    return db.select().from(jobs).where(eq(jobs.chapterId, chapterId)).all().map(toJob);
  },

  /** How many jobs sit in each status. Every status is present, so zero is explicit. */
  countByStatus(db: Db): Record<JobStatus, number> {
    const rows = db
      .select({ status: jobs.status, count: sql<number>`count(*)` })
      .from(jobs)
      .groupBy(jobs.status)
      .all();
    const counts = Object.fromEntries(ALL_STATUSES.map((status) => [status, 0])) as Record<
      JobStatus,
      number
    >;
    for (const row of rows) counts[row.status] = row.count;
    return counts;
  },

  /** The chapters whose jobs were touched most recently, newest first. Diagnostics reads their timings. */
  recentChapterIds(db: Db, limit: number): string[] {
    const lastActivity = sql`max(coalesce(${jobs.finishedAt}, ${jobs.startedAt}))`;
    return db
      .select({ chapterId: jobs.chapterId })
      .from(jobs)
      .groupBy(jobs.chapterId)
      .orderBy(desc(lastActivity))
      .limit(limit)
      .all()
      .map((row) => row.chapterId);
  },

  /** The most recent failed jobs, newest first. Diagnostics shows them to help with bug reports. */
  recentFailures(db: Db, limit: number): Job[] {
    return db
      .select()
      .from(jobs)
      .where(eq(jobs.status, 'failed'))
      .orderBy(desc(jobs.finishedAt))
      .limit(limit)
      .all()
      .map(toJob);
  },

  /** Marks a chapter's pending and running jobs as cancelled, for user cancellation. */
  cancelUnfinished(db: Db, chapterId: string, finishedAt: number): void {
    db.update(jobs)
      .set({ status: 'cancelled', finishedAt })
      .where(and(eq(jobs.chapterId, chapterId), inArray(jobs.status, UNFINISHED)))
      .run();
  },
};
