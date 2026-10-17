/**
 * Numeric rules shared by the prompt text and the validators, so the instructions the model sees
 * and the checks applied to its output cannot drift apart. Sources: ADR-0005 (wins on conflicts)
 * and R4 section 7.
 */

export const CUE_LIMITS = {
  /** Cues below this confidence are dropped (ADR-0005 amendment 2026-10-17: was 0.55). */
  confidenceFloor: 0.45,
  /** A cue spans at least this many sentences ... */
  minSentences: 3,
  /**
   * ... and at least this many estimated seconds of narration (see text/speech-rate). 12 s keeps about
   * 6 s at full level between the default fades, and admits a typical 4-sentence Mandarin scene
   * (ADR-0005 amendment, from the live test).
   */
  minSeconds: 12,
  /**
   * Density cap: cues allowed per 1,000 words of chapter text (at least one once a chapter
   * qualifies). ADR-0005 amendment 2026-10-17: was 2.
   */
  maxPer1kWords: 3,
  /** Chapters under this many words get no cues at all. */
  minWordsForCues: 200,
  /** At most this many beds may sound at the same sentence. */
  maxOverlappingBeds: 2,
  /** Same-category cues separated by at most this many sentences merge into one. */
  mergeGapSentences: 2,
  /** Maximum length of the stored `reason`. */
  reasonChars: 80,
} as const;

/**
 * Share of the narration that cues should cover when a passage has identifiable settings. This is a
 * target the prompt states. The validators do not enforce it, and the cue report shows the result.
 */
export const COVERAGE_GOAL_PERCENT = { min: 40, max: 80 } as const;

/**
 * Sampling for every analysis call (memory, cues, summary and fallback). Temperature 0 with a fixed
 * seed makes the same text give the same reply, which ADR-0005 needs for reproducible cues.
 */
export const ANALYSIS_SAMPLING = { temperature: 0, seed: 1017 } as const;

export const MEMORY_LIMITS = {
  summaryWords: 120,
  keyEvents: 10,
  keyEventWords: 25,
  characters: 15,
  places: 8,
  items: 8,
  /** Facts per character (domain spec). Also applied to places and items (B7 assumption). */
  facts: 5,
  relationships: 10,
  openThreads: 5,
  glossary: 30,
} as const;

/**
 * Token budget for one analysis chunk, estimated by `planLlmChunks` (src/core/text/chunk.ts). It
 * equals the former 12,000-character budget for CJK text, which is one token per character in that
 * estimate. Latin text (about four characters per token) now fits four times as much per call.
 */
export const MAX_CHUNK_TOKENS = 12000;
