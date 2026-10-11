import { and, eq, inArray } from 'drizzle-orm';

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

  /** Marks a chapter's pending and running jobs as cancelled, for user cancellation. */
  cancelUnfinished(db: Db, chapterId: string, finishedAt: number): void {
    db.update(jobs)
      .set({ status: 'cancelled', finishedAt })
      .where(and(eq(jobs.chapterId, chapterId), inArray(jobs.status, UNFINISHED)))
      .run();
  },
};
