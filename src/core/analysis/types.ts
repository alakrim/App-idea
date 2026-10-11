/**
 * Analysis-engine types. The contracts live in `@/core/domain`. This file re-exports them and
 * derives the few shapes that only exist inside the analysis pipeline.
 */
import type { AmbienceCue, AmbienceIntensity, ChapterMemory } from '@/core/domain';

export type { ChapterMemory, Entity, EntityFact, EntityKind, Lang } from '@/core/domain';

export type IntensityLevel = AmbienceIntensity;

/** One sentence of a chapter. `idx` is the 0-based index that is unique within the chapter. */
export interface SentenceInput {
  readonly idx: number;
  readonly text: string;
}

/** The LLM-produced part of a chapter memory. The chapter identity is added by the caller. */
export type MemoryFields = Omit<ChapterMemory, 'chapterId' | 'promptVersion' | 'model'>;

/** A stored chapter memory plus the ordering needed for spoiler cutoffs and citations. */
export interface ChapterMemoryRecord {
  readonly chapterOrder: number;
  /** Display number ("Ch. N"), derived from the chapter's rank. */
  readonly chapterNumber: number;
  readonly memory: ChapterMemory;
}

/** A cue that passed validation. Persistence adds `id`, `chapterId` and `enabled`. */
export type ValidatedCue = Pick<
  AmbienceCue,
  | 'category'
  | 'startSentence'
  | 'endSentence'
  | 'intensity'
  | 'fadeInMs'
  | 'fadeOutMs'
  | 'confidence'
  | 'reason'
>;
