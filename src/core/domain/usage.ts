import { z } from 'zod';

import { IdSchema, TimestampSchema } from './ids';
import { StageSchema } from './pipeline';

/** Pipeline stages plus the interactive features that also spend money. */
export const UsageStageSchema = z.union([StageSchema, z.enum(['qa', 'vocab', 'validate'])]);
export type UsageStage = z.infer<typeof UsageStageSchema>;

export const UsageEntrySchema = z.object({
  id: IdSchema,
  at: TimestampSchema,
  /** Null for usage not tied to a chapter, and kept when a chapter is deleted. */
  chapterId: IdSchema.nullable(),
  stage: UsageStageSchema,
  model: z.string().min(1),
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  audioSeconds: z.number().nonnegative().nullable(),
  /** Null when the cost is unknown. Shown as "unknown", never as $0. */
  costUsd: z.number().nonnegative().nullable(),
  generationId: z.string().nullable(),
});
export type UsageEntry = z.infer<typeof UsageEntrySchema>;
