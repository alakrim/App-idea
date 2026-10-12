/*
 * The "Recent chapters" block of Diagnostics: for the last few chapters, how long each pipeline stage
 * took and how much audio the chapter has. A slow stage shows in the next report without a debugger.
 * The probe writes the block as JSON values, and the screen reads it back through the same schema.
 */
import { z } from 'zod';

import { RUN_STAGES } from '@/core/domain';
import type { ChapterStatus, Job } from '@/core/domain';

import type { JsonValue } from './probe';

export const RECENT_CHAPTERS_PROBE_ID = 'recent-chapters';
/** How many chapters the block lists. */
export const RECENT_CHAPTER_LIMIT = 5;

export const StageTimingSchema = z.object({
  stage: z.string(),
  /** The job's status, or "not run" when the chapter has no job for the stage. */
  status: z.string(),
  /** Wall-clock seconds from start to finish, or null when the job has no finished run. */
  seconds: z.number().nullable(),
});

export const RecentChapterSchema = z.object({
  chapterId: z.string(),
  title: z.string(),
  chapterStatus: z.string(),
  stages: z.array(StageTimingSchema),
  segmentCount: z.number().int().nonnegative(),
  audioSeconds: z.number().nonnegative(),
});

export const RecentChaptersValuesSchema = z.object({
  chapters: z.array(RecentChapterSchema),
});

export type StageTiming = z.infer<typeof StageTimingSchema>;
export type RecentChapter = z.infer<typeof RecentChapterSchema>;

export interface RecentChapterInput {
  readonly chapter: { readonly id: string; readonly title: string; readonly status: ChapterStatus };
  readonly jobs: readonly Job[];
  readonly segments: readonly { readonly durationMs: number }[];
}

/** One chapter's row in the block: every run stage in order, and the audio it has. */
export function summarizeRecentChapter(input: RecentChapterInput): RecentChapter {
  const jobByStage = new Map(input.jobs.map((job) => [job.stage, job]));
  const stages = RUN_STAGES.map((stage): StageTiming => {
    const job = jobByStage.get(stage);
    if (!job) return { stage, status: 'not run', seconds: null };
    return { stage, status: job.status, seconds: stageSeconds(job) };
  });
  const audioMs = input.segments.reduce((sum, segment) => sum + segment.durationMs, 0);
  return {
    chapterId: input.chapter.id,
    title: input.chapter.title,
    chapterStatus: input.chapter.status,
    stages,
    segmentCount: input.segments.length,
    audioSeconds: roundTenth(audioMs / 1000),
  };
}

/** Seconds from a job's start to its finish, to a tenth. Null while it runs or when it never ran. */
export function stageSeconds(job: Pick<Job, 'status' | 'startedAt' | 'finishedAt'>): number | null {
  if (job.status === 'running' || job.startedAt === null || job.finishedAt === null) return null;
  if (job.finishedAt < job.startedAt) return null;
  return roundTenth((job.finishedAt - job.startedAt) / 1000);
}

/** The chapters in a probe's values. Anything that does not match the schema yields none. */
export function parseRecentChapters(values: Record<string, JsonValue>): RecentChapter[] {
  const parsed = RecentChaptersValuesSchema.safeParse(values);
  return parsed.success ? parsed.data.chapters : [];
}

function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}
