import { z } from 'zod';

import { IdSchema } from './ids';

export const TtsProviderIdSchema = z.enum(['openrouter', 'device']);
export type TtsProviderId = z.infer<typeof TtsProviderIdSchema>;

export const NarrationProfileSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  provider: TtsProviderIdSchema,
  model: z.string().min(1),
  voice: z.string().min(1),
  /** Steering instructions, when the model supports them. */
  style: z.string().nullable(),
  /** Synthesis-time speed, 0.8 to 1.2. */
  speed: z.number().min(0.8).max(1.2),
});
export type NarrationProfile = z.infer<typeof NarrationProfileSchema>;

export const AudioSegmentSchema = z
  .object({
    id: IdSchema,
    chapterId: IdSchema,
    idx: z.number().int().nonnegative(),
    sentenceStart: z.number().int().nonnegative(),
    /** Inclusive. */
    sentenceEnd: z.number().int().nonnegative(),
    fileUri: z.string().min(1),
    durationMs: z.number().int().nonnegative(),
    /** Start offset of each sentence within the segment, in ms. */
    sentenceOffsetsMs: z.array(z.number().int().nonnegative()),
    profileId: IdSchema,
    inputHash: z.string().min(1),
  })
  .refine((s) => s.sentenceEnd >= s.sentenceStart, 'sentenceEnd must be >= sentenceStart');
export type AudioSegment = z.infer<typeof AudioSegmentSchema>;
