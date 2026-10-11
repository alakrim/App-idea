import { z } from 'zod';

import { IdSchema, TimestampSchema } from './ids';

export const StageSchema = z.enum([
  'extract',
  'clean',
  'segment',
  'analyze',
  'translate',
  'narrate',
]);
export type Stage = z.infer<typeof StageSchema>;

export const JobStatusSchema = z.enum([
  'pending',
  'running',
  'done',
  'failed',
  'skipped',
  'cancelled',
]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const ErrorCodeSchema = z.enum([
  'NETWORK',
  'AUTH',
  'INSUFFICIENT_CREDITS',
  'RATE_LIMITED',
  'MODEL_UNAVAILABLE',
  'CONTENT_EMPTY',
  'CONTENT_BLOCKED',
  'PARSE_FAILED',
  'LLM_INVALID_OUTPUT',
  'INPUT_TOO_LONG',
  'STORAGE_FULL',
  'CANCELLED',
  'UNKNOWN',
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const PipelineErrorSchema = z.object({
  code: ErrorCodeSchema,
  /** User-facing copy: what happened and what to do next. */
  message: z.string().min(1),
  detail: z.string().optional(),
  retryable: z.boolean(),
});
export type PipelineError = z.infer<typeof PipelineErrorSchema>;

export const JobSchema = z.object({
  id: IdSchema,
  chapterId: IdSchema,
  stage: StageSchema,
  status: JobStatusSchema,
  attempt: z.number().int().nonnegative(),
  inputHash: z.string(),
  model: z.string().nullable(),
  promptVersion: z.string().nullable(),
  progress: z.number().min(0).max(1),
  error: PipelineErrorSchema.nullable(),
  costUsd: z.number().nonnegative(),
  startedAt: TimestampSchema.nullable(),
  finishedAt: TimestampSchema.nullable(),
});
export type Job = z.infer<typeof JobSchema>;
