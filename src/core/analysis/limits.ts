/**
 * Numeric rules shared by the prompt text and the validators, so the instructions the model sees
 * and the checks applied to its output cannot drift apart. Sources: ADR-0005 (wins on conflicts)
 * and R4 section 7.
 */

export const CUE_LIMITS = {
  /** Cues below this confidence are dropped (ADR-0005). */
  confidenceFloor: 0.55,
  /** A cue spans at least this many sentences ... */
  minSentences: 3,
  /** ... and at least this many estimated seconds of narration. */
  minSeconds: 20,
  /** Narration speed used to estimate seconds from characters. */
  charsPerSecond: 15,
  /** Density cap: cues allowed per 1,000 words of chapter text. */
  maxPer1kWords: 2,
  /** At most this many beds may sound at the same sentence. */
  maxOverlappingBeds: 2,
  /** Same-category cues separated by at most this many sentences merge into one. */
  mergeGapSentences: 2,
  /** Maximum length of the stored `reason`. */
  reasonChars: 80,
} as const;

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

/** Approximate character budget for one LLM chunk of sentence text (B7 assumption). */
export const MAX_CHUNK_CHARS = 12000;
