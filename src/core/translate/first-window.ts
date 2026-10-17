/*
 * The opening window of a translated chapter (ADR-0008). It is translated at once, before analysis
 * has finished, so narration can start while the rest of the chapter is still being made.
 */
import { estimateSpeechSeconds } from '../text/speech-rate';

/** About this much narration is translated before the chapter's analysis is needed. */
export const FIRST_WINDOW_SECONDS = 90;

/**
 * The idx of the last sentence in the opening window: the sentences whose narration adds up to about
 * `FIRST_WINDOW_SECONDS`, counted in the target language's speech rate. The sentence that crosses the
 * limit belongs to the window. Blank sentences are skipped. Returns -1 when the chapter has no text to
 * speak, so the window is empty.
 */
export function firstWindowEnd(
  sentences: readonly { readonly idx: number; readonly text: string }[],
  targetLang: string | null,
): number {
  let seconds = 0;
  let end = -1;
  for (const sentence of sentences) {
    if (sentence.text.trim() === '') continue;
    seconds += estimateSpeechSeconds(sentence.text, targetLang);
    end = sentence.idx;
    if (seconds >= FIRST_WINDOW_SECONDS) break;
  }
  return end;
}
