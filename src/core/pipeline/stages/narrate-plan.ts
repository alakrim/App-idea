/*
 * The segment plan of the narrate stage. Pure: the same final sentences and profile always give the
 * same segments and hashes, which is what makes a rerun reuse the audio already saved.
 */
import { countCodePoints } from '@/core/text/build';
import { NARRATION_RAMP_SECONDS, planTtsSegments } from '@/core/text/chunk';
import { detectScript } from '@/core/text/normalize';
import { estimateSpeechSeconds } from '@/core/text/speech-rate';

import { stableHash } from '../hash';

import type { SpokenSentence } from '../spoken-text';

/** A segment the narrator will speak. Its `hash` covers its text and the voice that speaks it. */
export interface PlannedSegment {
  readonly idx: number;
  readonly sentenceStart: number;
  readonly sentenceEnd: number;
  readonly sentenceTexts: readonly string[];
  readonly text: string;
  readonly chars: number;
  readonly hash: string;
}

export interface PlanOptions {
  /** The narrator's longest segment, in characters. */
  readonly maxChars: number;
  /** The narrator's longest segment, in estimated speech seconds. */
  readonly maxSeconds: number;
  /** The language read aloud. It sets the speech time of a sentence, which sizes the opening segments. */
  readonly lang: string | null;
  /** The narration settings that change the audio: provider, model, voice, style and speed. */
  readonly voiceKey: readonly unknown[];
}

/**
 * The segments that are final. A segment is final when a later sentence has closed it, or when the
 * chapter is complete. The last open segment of an incomplete chapter is left out, because the
 * sentences that follow it could still join it.
 */
export function planFinalSegments(
  sentences: readonly SpokenSentence[],
  options: PlanOptions,
  complete: boolean,
): PlannedSegment[] {
  const groups = planTtsSegments(
    sentences.map((s) => ({
      idx: s.idx,
      paragraphIdx: s.paragraphIdx,
      kind: s.kind,
      charCount: s.charCount,
      speechSeconds: estimateSpeechSeconds(s.text, options.lang),
    })),
    {
      maxChars: options.maxChars,
      maxSeconds: options.maxSeconds,
      rampSeconds: NARRATION_RAMP_SECONDS,
    },
  );
  const final = complete ? groups : groups.slice(0, -1);
  return final.map((group, idx) => {
    const members = sentences.filter(
      (s) => s.idx >= group.sentenceStart && s.idx <= group.sentenceEnd,
    );
    const sentenceTexts = members.map((m) => m.text);
    const text = joinSpoken(sentenceTexts);
    return {
      idx,
      sentenceStart: group.sentenceStart,
      sentenceEnd: group.sentenceEnd,
      sentenceTexts,
      text,
      chars: countCodePoints(text),
      hash: stableHash([text, ...options.voiceKey]),
    };
  });
}

/**
 * Joins sentences with a space, except after a CJK sentence, which is written without one. The
 * script is read from the sentence just joined, so its closing punctuation does not decide it.
 */
export function joinSpoken(parts: readonly string[]): string {
  return parts.reduce((acc, part, i) => {
    if (acc === '') return part;
    const separator = detectScript(parts[i - 1] ?? '') === 'cjk' ? '' : ' ';
    return `${acc}${separator}${part}`;
  }, '');
}
