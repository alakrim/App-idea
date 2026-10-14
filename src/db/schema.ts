import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

import type {
  AmbienceIntensity,
  ChapterStatus,
  EntityKind,
  JobStatus,
  ParagraphKind,
  QaRole,
  Stage,
  TtsProviderId,
  UsageStage,
} from '../core/domain';

/*
 * Conventions: table and column names are snake_case; ids are ULID text unless noted.
 * JSON columns are stored as text and validated with zod on every read in the repositories.
 * Every foreign key column is the leading column of an index (explicit, or a composite unique).
 * sentences_fts (FTS5) is not declared here; it lives in a hand-written migration because
 * drizzle-kit does not model virtual tables. See migrations/*_fts5_sentences.sql.
 */

export const narrationProfiles = sqliteTable('narration_profiles', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  provider: text('provider').$type<TtsProviderId>().notNull(),
  model: text('model').notNull(),
  voice: text('voice').notNull(),
  style: text('style'),
  speed: real('speed').notNull(),
});

export const series = sqliteTable(
  'series',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    coverUri: text('cover_uri'),
    coverTint: text('cover_tint'),
    sourceLang: text('source_lang'),
    targetLang: text('target_lang'),
    narrationProfileId: text('narration_profile_id').references(() => narrationProfiles.id, {
      onDelete: 'set null',
    }),
    /** The speed last used in this series. Null until the listener changes it. */
    playbackRate: real('playback_rate'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('series_narration_profile_id_idx').on(t.narrationProfileId)],
);

export const chapters = sqliteTable(
  'chapters',
  {
    id: text('id').primaryKey(),
    seriesId: text('series_id')
      .notNull()
      .references(() => series.id, { onDelete: 'cascade' }),
    order: real('order').notNull(),
    title: text('title').notNull(),
    /** JSON: ChapterSourceSchema. */
    source: text('source').notNull(),
    sourceLang: text('source_lang'),
    status: text('status').$type<ChapterStatus>().notNull(),
    wordCount: integer('word_count'),
    durationMs: integer('duration_ms'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('chapters_series_order_idx').on(t.seriesId, t.order)],
);

export const paragraphs = sqliteTable(
  'paragraphs',
  {
    chapterId: text('chapter_id')
      .notNull()
      .references(() => chapters.id, { onDelete: 'cascade' }),
    idx: integer('idx').notNull(),
    sentenceStart: integer('sentence_start').notNull(),
    sentenceEnd: integer('sentence_end').notNull(),
    kind: text('kind').$type<ParagraphKind>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.chapterId, t.idx] })],
);

/** Integer id so the FTS5 external-content table can use it as its rowid. */
export const sentences = sqliteTable(
  'sentences',
  {
    id: integer('id').primaryKey(),
    chapterId: text('chapter_id')
      .notNull()
      .references(() => chapters.id, { onDelete: 'cascade' }),
    idx: integer('idx').notNull(),
    paragraphIdx: integer('paragraph_idx').notNull(),
    text: text('text').notNull(),
    translated: text('translated'),
    charCount: integer('char_count').notNull(),
  },
  (t) => [uniqueIndex('sentences_chapter_idx_uq').on(t.chapterId, t.idx)],
);

export const ambienceCues = sqliteTable(
  'ambience_cues',
  {
    id: text('id').primaryKey(),
    chapterId: text('chapter_id')
      .notNull()
      .references(() => chapters.id, { onDelete: 'cascade' }),
    category: text('category').notNull(),
    startSentence: integer('start_sentence').notNull(),
    endSentence: integer('end_sentence').notNull(),
    intensity: text('intensity').$type<AmbienceIntensity>().notNull(),
    fadeInMs: integer('fade_in_ms').notNull(),
    fadeOutMs: integer('fade_out_ms').notNull(),
    confidence: real('confidence').notNull(),
    reason: text('reason').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull(),
  },
  (t) => [index('ambience_cues_chapter_start_idx').on(t.chapterId, t.startSentence)],
);

export const chapterMemory = sqliteTable('chapter_memory', {
  chapterId: text('chapter_id')
    .primaryKey()
    .references(() => chapters.id, { onDelete: 'cascade' }),
  promptVersion: text('prompt_version').notNull(),
  model: text('model').notNull(),
  /** JSON: ChapterMemorySchema. */
  memory: text('memory').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const entities = sqliteTable(
  'entities',
  {
    id: text('id').primaryKey(),
    seriesId: text('series_id')
      .notNull()
      .references(() => series.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<EntityKind>().notNull(),
    canonicalName: text('canonical_name').notNull(),
    /** JSON: string[]. */
    aliases: text('aliases').notNull(),
    firstChapterOrder: real('first_chapter_order').notNull(),
  },
  (t) => [index('entities_series_name_idx').on(t.seriesId, t.canonicalName)],
);

export const entityFacts = sqliteTable(
  'entity_facts',
  {
    id: text('id').primaryKey(),
    entityId: text('entity_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'cascade' }),
    chapterId: text('chapter_id')
      .notNull()
      .references(() => chapters.id, { onDelete: 'cascade' }),
    chapterOrder: real('chapter_order').notNull(),
    fact: text('fact').notNull(),
  },
  (t) => [
    index('entity_facts_entity_idx').on(t.entityId),
    index('entity_facts_chapter_idx').on(t.chapterId),
  ],
);

export const audioSegments = sqliteTable(
  'audio_segments',
  {
    id: text('id').primaryKey(),
    chapterId: text('chapter_id')
      .notNull()
      .references(() => chapters.id, { onDelete: 'cascade' }),
    idx: integer('idx').notNull(),
    sentenceStart: integer('sentence_start').notNull(),
    sentenceEnd: integer('sentence_end').notNull(),
    fileUri: text('file_uri').notNull(),
    durationMs: integer('duration_ms').notNull(),
    /** JSON: number[]. */
    sentenceOffsetsMs: text('sentence_offsets_ms').notNull(),
    /** Restrict: a profile that still has audio cannot be deleted silently. */
    profileId: text('profile_id')
      .notNull()
      .references(() => narrationProfiles.id, { onDelete: 'restrict' }),
    inputHash: text('input_hash').notNull(),
  },
  (t) => [
    uniqueIndex('audio_segments_chapter_idx_uq').on(t.chapterId, t.idx),
    index('audio_segments_profile_idx').on(t.profileId),
  ],
);

export const jobs = sqliteTable(
  'jobs',
  {
    id: text('id').primaryKey(),
    chapterId: text('chapter_id')
      .notNull()
      .references(() => chapters.id, { onDelete: 'cascade' }),
    stage: text('stage').$type<Stage>().notNull(),
    status: text('status').$type<JobStatus>().notNull(),
    attempt: integer('attempt').notNull().default(0),
    inputHash: text('input_hash').notNull(),
    model: text('model'),
    promptVersion: text('prompt_version'),
    progress: real('progress').notNull().default(0),
    /** JSON: PipelineErrorSchema, or null. */
    error: text('error'),
    costUsd: real('cost_usd').notNull().default(0),
    startedAt: integer('started_at'),
    finishedAt: integer('finished_at'),
  },
  (t) => [uniqueIndex('jobs_chapter_stage_uq').on(t.chapterId, t.stage)],
);

/** Spend records outlive their chapter: chapter_id is set to NULL, never cascaded. */
export const usageLedger = sqliteTable(
  'usage_ledger',
  {
    id: text('id').primaryKey(),
    at: integer('at').notNull(),
    chapterId: text('chapter_id').references(() => chapters.id, { onDelete: 'set null' }),
    stage: text('stage').$type<UsageStage>().notNull(),
    model: text('model').notNull(),
    promptTokens: integer('prompt_tokens').notNull(),
    completionTokens: integer('completion_tokens').notNull(),
    audioSeconds: real('audio_seconds'),
    costUsd: real('cost_usd').notNull(),
    generationId: text('generation_id'),
  },
  (t) => [
    index('usage_ledger_chapter_idx').on(t.chapterId),
    index('usage_ledger_at_idx').on(t.at),
    index('usage_ledger_model_idx').on(t.model),
  ],
);

/**
 * One row per chapter the listener has played: where they stopped, and whether they reached the
 * end. Resume reads this row, so a chapter picks up its own place whichever chapter was last heard.
 */
export const chapterPositions = sqliteTable('chapter_positions', {
  chapterId: text('chapter_id')
    .primaryKey()
    .references(() => chapters.id, { onDelete: 'cascade' }),
  sentenceIdx: integer('sentence_idx').notNull(),
  positionMs: integer('position_ms').notNull(),
  completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
  updatedAt: integer('updated_at').notNull(),
});

/** A saved moment in a chapter. One bookmark per sentence, so a sentence is either marked or not. */
export const bookmarks = sqliteTable(
  'bookmarks',
  {
    id: text('id').primaryKey(),
    seriesId: text('series_id')
      .notNull()
      .references(() => series.id, { onDelete: 'cascade' }),
    chapterId: text('chapter_id')
      .notNull()
      .references(() => chapters.id, { onDelete: 'cascade' }),
    sentenceIdx: integer('sentence_idx').notNull(),
    positionMs: integer('position_ms').notNull(),
    note: text('note'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('bookmarks_chapter_sentence_uq').on(t.chapterId, t.sentenceIdx),
    index('bookmarks_series_idx').on(t.seriesId),
  ],
);

/** One row per series: `current` is where the listener is, `furthest` is the spoiler cutoff. */
export const listeningPositions = sqliteTable(
  'listening_positions',
  {
    seriesId: text('series_id')
      .primaryKey()
      .references(() => series.id, { onDelete: 'cascade' }),
    currentChapterId: text('current_chapter_id')
      .notNull()
      .references(() => chapters.id, { onDelete: 'cascade' }),
    currentChapterOrder: real('current_chapter_order').notNull(),
    currentSentenceIdx: integer('current_sentence_idx').notNull(),
    furthestChapterId: text('furthest_chapter_id')
      .notNull()
      .references(() => chapters.id, { onDelete: 'cascade' }),
    furthestChapterOrder: real('furthest_chapter_order').notNull(),
    furthestSentenceIdx: integer('furthest_sentence_idx').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    index('listening_positions_current_chapter_idx').on(t.currentChapterId),
    index('listening_positions_furthest_chapter_idx').on(t.furthestChapterId),
  ],
);

export const qaMessages = sqliteTable(
  'qa_messages',
  {
    id: text('id').primaryKey(),
    seriesId: text('series_id')
      .notNull()
      .references(() => series.id, { onDelete: 'cascade' }),
    role: text('role').$type<QaRole>().notNull(),
    content: text('content').notNull(),
    cutoffChapterOrder: real('cutoff_chapter_order').notNull(),
    cutoffSentenceIdx: integer('cutoff_sentence_idx').notNull(),
    /** JSON: SentenceRef[]. */
    citations: text('citations').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('qa_messages_series_created_idx').on(t.seriesId, t.createdAt)],
);

export const vocab = sqliteTable(
  'vocab',
  {
    id: text('id').primaryKey(),
    seriesId: text('series_id')
      .notNull()
      .references(() => series.id, { onDelete: 'cascade' }),
    chapterId: text('chapter_id')
      .notNull()
      .references(() => chapters.id, { onDelete: 'cascade' }),
    sentenceIdx: integer('sentence_idx').notNull(),
    term: text('term').notNull(),
    lang: text('lang').notNull(),
    explanation: text('explanation'),
    translation: text('translation'),
    /** Set by every flashcard review. Null until the item has been reviewed once. */
    reviewedAt: integer('reviewed_at'),
    /** The last flashcard verdict: true for "Known", false for "Again" or never reviewed. */
    known: integer('known', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    index('vocab_series_created_idx').on(t.seriesId, t.createdAt),
    index('vocab_chapter_idx').on(t.chapterId),
  ],
);

/**
 * Live activity of a chapter's stage, for Diagnostics: when it last moved, and how often it stalled
 * or had a request retired as stale. A stage's counts start again when the stage starts running.
 */
export const stageActivity = sqliteTable(
  'stage_activity',
  {
    chapterId: text('chapter_id')
      .notNull()
      .references(() => chapters.id, { onDelete: 'cascade' }),
    stage: text('stage').$type<Stage>().notNull(),
    lastActivityAt: integer('last_activity_at').notNull(),
    stallCount: integer('stall_count').notNull().default(0),
    staleAbortCount: integer('stale_abort_count').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.chapterId, t.stage] })],
);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  /** JSON: any value. Validated by the caller that owns the key. */
  value: text('value').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const schema = {
  narrationProfiles,
  series,
  chapters,
  paragraphs,
  sentences,
  ambienceCues,
  chapterMemory,
  entities,
  entityFacts,
  audioSegments,
  jobs,
  stageActivity,
  usageLedger,
  listeningPositions,
  chapterPositions,
  bookmarks,
  qaMessages,
  vocab,
  settings,
};
