/*
 * The cue cache (ADR-0005 amendment 2026-10-17). Validated cues are stored under a hash of the
 * chapter text, the model and the prompt version. A re-upload of the same text then gets the same
 * cues, with no cue call and no new roll of the dice.
 */
import { z } from 'zod';

import { AmbienceIntensitySchema } from '../domain';
import { PROMPT_VERSION } from './prompts';
import { stableHash } from '../pipeline/hash';

/** The stored form of a validated cue. The database repository parses every row with it. */
export const CachedCuesSchema = z.array(
  z.object({
    category: z.string().min(1),
    startSentence: z.number().int().nonnegative(),
    endSentence: z.number().int().nonnegative(),
    intensity: AmbienceIntensitySchema,
    fadeInMs: z.number().int().nonnegative(),
    fadeOutMs: z.number().int().nonnegative(),
    confidence: z.number().min(0).max(1),
    reason: z.string().max(80),
  }),
);

/** The key a text's cues are cached under. The sentence texts are hashed in order. */
export function cueCacheKey(model: string, sentenceTexts: readonly string[]): string {
  return stableHash(['cues', PROMPT_VERSION, model, sentenceTexts]);
}
