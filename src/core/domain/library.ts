import { z } from 'zod';

import { IdSchema, TimestampSchema } from './ids';

/** BCP-47 language tag, e.g. 'zh-Hans', 'it', 'pt-BR'. Shape check only; the tag registry is not enforced. */
export const LangSchema = z
  .string()
  .regex(/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{1,8})*$/, 'Expected a BCP-47 language tag');
export type Lang = z.infer<typeof LangSchema>;

export const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Expected a #RRGGBB colour');

export const SeriesSchema = z.object({
  id: IdSchema,
  title: z.string().min(1),
  coverUri: z.string().nullable(),
  coverTint: HexColorSchema.nullable(),
  sourceLang: LangSchema.nullable(),
  targetLang: LangSchema.nullable(),
  narrationProfileId: IdSchema.nullable(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type Series = z.infer<typeof SeriesSchema>;

export const ChapterSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('url'), url: z.url(), finalUrl: z.url().optional() }),
  z.object({
    kind: z.literal('pdf'),
    fileUri: z.string().min(1),
    fileName: z.string().min(1),
    pageRange: z.tuple([z.number().int().positive(), z.number().int().positive()]).optional(),
  }),
  z.object({ kind: z.literal('text'), label: z.string() }),
]);
export type ChapterSource = z.infer<typeof ChapterSourceSchema>;

export const ChapterStatusSchema = z.enum(['draft', 'processing', 'ready', 'failed']);
export type ChapterStatus = z.infer<typeof ChapterStatusSchema>;

export const ChapterSchema = z.object({
  id: IdSchema,
  seriesId: IdSchema,
  /** Fractional so a chapter can be inserted between two others without renumbering. */
  order: z.number().finite(),
  title: z.string(),
  source: ChapterSourceSchema,
  sourceLang: LangSchema.nullable(),
  status: ChapterStatusSchema,
  wordCount: z.number().int().nonnegative().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type Chapter = z.infer<typeof ChapterSchema>;

/** A position in the book: a chapter (with its order snapshot) and a sentence index. */
export const PlaybackPointSchema = z.object({
  chapterId: IdSchema,
  chapterOrder: z.number().finite(),
  sentenceIdx: z.number().int().nonnegative(),
});
export type PlaybackPoint = z.infer<typeof PlaybackPointSchema>;

/**
 * `current` is where the listener is now. `furthest` is the maximum position ever reached and is
 * the spoiler cutoff for Q&A. Only the repository advances `furthest`.
 */
export const ListeningPositionSchema = z.object({
  seriesId: IdSchema,
  current: PlaybackPointSchema,
  furthest: PlaybackPointSchema,
  updatedAt: TimestampSchema,
});
export type ListeningPosition = z.infer<typeof ListeningPositionSchema>;
