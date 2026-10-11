import { jobRepo } from '@/db/repos/job-repo';
import type { Db } from '@/db/types';

import type { JsonValue, ProbeOutcome } from './probe';

/** How many recent job errors the report carries. */
export const RECENT_ERROR_LIMIT = 10;

/** The queue as the database holds it, plus the last errors. Reading them never fails the probe on its own. */
export function checkPipelineQueue(db: Db): ProbeOutcome {
  const counts = jobRepo.countByStatus(db);
  const recentErrors: JsonValue[] = jobRepo.recentFailures(db, RECENT_ERROR_LIMIT).map((job) => ({
    chapterId: job.chapterId,
    stage: job.stage,
    attempt: job.attempt,
    code: job.error?.code ?? null,
    message: job.error?.message ?? null,
    detail: job.error?.detail ?? null,
    finishedAt: job.finishedAt,
  }));
  return {
    status: 'pass',
    values: {
      queue: { pending: counts.pending, running: counts.running },
      jobCounts: { ...counts },
      recentErrors,
    },
  };
}
