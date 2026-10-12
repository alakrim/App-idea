import { audioSegmentRepo } from '@/db/repos/audio-segment-repo';
import { chapterRepo } from '@/db/repos/chapter-repo';
import { jobRepo } from '@/db/repos/job-repo';
import type { Db } from '@/db/types';

import { RECENT_CHAPTER_LIMIT, summarizeRecentChapter } from './recent-chapters';

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

/** The last chapters that ran, with the time each stage took and the audio each one has. */
export function checkRecentChapters(db: Db): ProbeOutcome {
  const chapters = jobRepo.recentChapterIds(db, RECENT_CHAPTER_LIMIT).flatMap((chapterId) => {
    const chapter = chapterRepo.get(db, chapterId);
    if (!chapter) return [];
    return [
      summarizeRecentChapter({
        chapter,
        jobs: jobRepo.listForChapter(db, chapterId),
        segments: audioSegmentRepo.listByChapter(db, chapterId),
      }),
    ];
  });
  return { status: 'pass', values: { chapters } };
}
