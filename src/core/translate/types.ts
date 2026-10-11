/** One sentence to translate. `idx` is the 0-based sentence index, unique within the chapter. */
export interface TranslateSentence {
  readonly idx: number;
  readonly text: string;
}

/** One translated sentence as the model returns it. */
export interface TranslatedItem {
  readonly idx: number;
  readonly text: string;
}

/** A glossary line for the prompt. A null `translation` means keep the source form. */
export interface GlossaryEntry {
  readonly term: string;
  readonly translation: string | null;
  readonly note: string | null;
}

/** A sentence of recent context. `translation` is null when it is not translated yet. */
export interface PreviousSentence {
  readonly idx: number;
  readonly source: string;
  readonly translation: string | null;
}

/** The system and user messages of one model call. */
export interface PromptPair {
  readonly system: string;
  readonly user: string;
}

/**
 * Call accounting for one translation run. The transport returns text only, so the token counts
 * are estimates from the text-length heuristic, not billed usage.
 */
export interface TranslateUsage {
  /** Model calls made, including repair calls. */
  readonly requests: number;
  readonly repairRequests: number;
  readonly estimatedInputTokens: number;
  readonly estimatedOutputTokens: number;
}
