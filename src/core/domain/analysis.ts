import { z } from 'zod';

import { IdSchema, TimestampSchema } from './ids';
import { SentenceRefSchema } from './text';

/**
 * Placeholder: any non-empty string until the ambience taxonomy brief narrows this to the
 * enum in src/core/analysis/ambience-taxonomy.ts. Category ids are stable snake_case and never renamed.
 */
export const AmbienceCategoryIdSchema = z.string().min(1);
export type AmbienceCategoryId = z.infer<typeof AmbienceCategoryIdSchema>;

export const AmbienceIntensitySchema = z.enum(['low', 'medium', 'high']);
export type AmbienceIntensity = z.infer<typeof AmbienceIntensitySchema>;

export const AmbienceCueSchema = z
  .object({
    id: IdSchema,
    chapterId: IdSchema,
    category: AmbienceCategoryIdSchema,
    startSentence: z.number().int().nonnegative(),
    /** Inclusive. */
    endSentence: z.number().int().nonnegative(),
    intensity: AmbienceIntensitySchema,
    fadeInMs: z.number().int().nonnegative(),
    fadeOutMs: z.number().int().nonnegative(),
    confidence: z.number().min(0).max(1),
    /** Shown in a debug/info sheet, so it stays short. */
    reason: z.string().max(80),
    enabled: z.boolean(),
  })
  .refine((c) => c.endSentence >= c.startSentence, 'endSentence must be >= startSentence');
export type AmbienceCue = z.infer<typeof AmbienceCueSchema>;

export const EntityKindSchema = z.enum(['character', 'place', 'item', 'faction', 'term']);
export type EntityKind = z.infer<typeof EntityKindSchema>;

const NamedFactsSchema = z.object({
  name: z.string().min(1),
  facts: z.array(z.string()).max(8),
});

export const ChapterMemorySchema = z.object({
  chapterId: IdSchema,
  promptVersion: z.string().min(1),
  model: z.string().min(1),
  /** At most 120 words. The word cap is enforced by the analysis validator in src/core/analysis. */
  summary: z.string(),
  keyEvents: z.array(z.string()).max(10),
  characters: z
    .array(
      z.object({
        name: z.string().min(1),
        aliases: z.array(z.string()),
        role: z.string().optional(),
        facts: z.array(z.string()).max(5),
      }),
    )
    .max(15),
  places: z.array(NamedFactsSchema).max(8),
  items: z.array(NamedFactsSchema).max(8),
  relationships: z.array(z.object({ a: z.string(), b: z.string(), nature: z.string() })).max(10),
  openThreads: z.array(z.string()).max(5),
  glossary: z
    .array(
      z.object({
        term: z.string().min(1),
        translation: z.string().optional(),
        note: z.string().optional(),
      }),
    )
    .max(30),
});
export type ChapterMemory = z.infer<typeof ChapterMemorySchema>;

/**
 * A spelling of an entity, stamped with the chapter that revealed it. A spelling that is only
 * learned later must stay out of the earlier chapters' context, or the spoiler shield leaks it.
 */
export const EntityAliasSchema = z.object({
  alias: z.string().min(1),
  firstChapterOrder: z.number().finite(),
});
export type EntityAlias = z.infer<typeof EntityAliasSchema>;

export const EntitySchema = z.object({
  id: IdSchema,
  seriesId: IdSchema,
  kind: EntityKindSchema,
  canonicalName: z.string().min(1),
  aliases: z.array(EntityAliasSchema),
  firstChapterOrder: z.number().finite(),
});
export type Entity = z.infer<typeof EntitySchema>;

export const EntityFactSchema = z.object({
  id: IdSchema,
  entityId: IdSchema,
  chapterId: IdSchema,
  /** Chapter order at the time of extraction, used for the spoiler filter. */
  chapterOrder: z.number().finite(),
  fact: z.string().min(1),
});
export type EntityFact = z.infer<typeof EntityFactSchema>;

export const QaRoleSchema = z.enum(['user', 'assistant']);
export type QaRole = z.infer<typeof QaRoleSchema>;

export const QaMessageSchema = z.object({
  id: IdSchema,
  seriesId: IdSchema,
  role: QaRoleSchema,
  content: z.string(),
  /** The spoiler cutoff in force when the message was written. */
  cutoffChapterOrder: z.number().finite(),
  cutoffSentenceIdx: z.number().int().nonnegative(),
  citations: z.array(SentenceRefSchema),
  createdAt: TimestampSchema,
});
export type QaMessage = z.infer<typeof QaMessageSchema>;
