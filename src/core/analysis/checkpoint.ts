/*
 * The per-chunk checkpoint of a chapter's analysis (QA-F F-02). A finished chunk reply is stored, so
 * a retried analysis reuses it instead of buying the same chunk again. The stored shape is the
 * analysis call result, and it is validated on every read.
 */
import { z } from 'zod';

import { ChapterMemorySchema } from '../domain';
import { AMBIENCE_ERAS } from './ambience-taxonomy';

export const AnalysisCheckpointSchema = z.object({
  memory: ChapterMemorySchema.omit({ chapterId: true, promptVersion: true, model: true }),
  cues: z.array(z.unknown()),
  era: z.enum(AMBIENCE_ERAS).nullable(),
  usage: z.object({
    promptTokens: z.number().int().nonnegative(),
    completionTokens: z.number().int().nonnegative(),
    costUsd: z.number().nonnegative().nullable(),
  }),
});
