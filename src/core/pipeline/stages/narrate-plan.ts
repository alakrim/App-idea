/*
 * The segment plan of the narrate stage. Pure: the same final sentences and profile always give the
 * same segments and hashes, which is what makes a rerun reuse the audio already saved.
 */
import { NARRATION_RAMP_CHARS, planTtsSegments } from '@/core/text/chunk';
import { detectScript } from '@/core/text/normalize';
import { countCodePoints } from '@/core/text/build';

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
  const groups = planTtsSegments(sentences, {
    maxChars: options.maxChars,
    ramp: NARRATION_RAMP_CHARS,
  });
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

/** Joins sentences with a space, except between CJK sentences, which are written without one. */
export function joinSpoken(parts: readonly string[]): string {
  return parts.reduce((acc, part) => {
    if (acc === '') return part;
    const separator = detectScript(acc.slice(-1)) === 'cjk' ? '' : ' ';
    return `${acc}${separator}${part}`;
  }, '');
}
