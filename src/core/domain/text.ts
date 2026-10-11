import { z } from 'zod';

import { IdSchema, TimestampSchema } from './ids';
import { LangSchema } from './library';

export const ParagraphKindSchema = z.enum(['text', 'heading', 'quote', 'dialogue']);
export type ParagraphKind = z.infer<typeof ParagraphKindSchema>;

export const ParagraphSchema = z
  .object({
    idx: z.number().int().nonnegative(),
    sentenceStart: z.number().int().nonnegative(),
    /** Exclusive. */
    sentenceEnd: z.number().int().nonnegative(),
    kind: ParagraphKindSchema,
  })
  .refine((p) => p.sentenceEnd >= p.sentenceStart, 'sentenceEnd must be >= sentenceStart');
export type Paragraph = z.infer<typeof ParagraphSchema>;

/** Stable address of a sentence. `idx` is 0-based and unique within a chapter. */
export const SentenceRefSchema = z.object({
  chapterId: IdSchema,
  idx: z.number().int().nonnegative(),
});
export type SentenceRef = z.infer<typeof SentenceRefSchema>;

export const SentenceSchema = z.object({
  chapterId: IdSchema,
  idx: z.number().int().nonnegative(),
  paragraphIdx: z.number().int().nonnegative(),
  text: z.string(),
  translated: z.string().nullable(),
  charCount: z.number().int().nonnegative(),
});
export type Sentence = z.infer<typeof SentenceSchema>;

/** A word or phrase the learner saved, with the sentence it came from. */
export const VocabSchema = z.object({
  id: IdSchema,
  seriesId: IdSchema,
  chapterId: IdSchema,
  sentenceIdx: z.number().int().nonnegative(),
  term: z.string().min(1),
  lang: LangSchema,
  explanation: z.string().nullable(),
  translation: z.string().nullable(),
  /** Set by every flashcard review. Null until the item has been reviewed once. */
  reviewedAt: TimestampSchema.nullable(),
  /** The last flashcard verdict: true for "Known", false for "Again" or never reviewed. */
  known: z.boolean(),
  createdAt: TimestampSchema,
});
export type Vocab = z.infer<typeof VocabSchema>;
