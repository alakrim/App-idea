/*
 * The compact cue report of one chapter's analysis (ADR-0005 amendment 2026-10-17). It holds counts
 * and flags only. Reason text from the model is never stored here.
 */
import { z } from 'zod';

import { CUE_DROP_REASONS } from './validate-cues';
import { estimateSpeechSeconds } from '../text/speech-rate';

import type { SentenceInput, ValidatedCue } from './types';
import type { CueDropReason, DroppedCue } from './validate-cues';

export const CueReportSchema = z.object({
  model: z.string().min(1),
  promptVersion: z.string().min(1),
  /** Epoch milliseconds. */
  createdAt: z.number().int().nonnegative(),
  accepted: z.number().int().nonnegative(),
  /** Every drop reason is present, with zero for the ones that did not happen. */
  droppedByReason: z.record(z.enum(CUE_DROP_REASONS), z.number().int().nonnegative()),
  /** Share of the narration time covered by at least one cue, or null when there is no speech. */
  coveragePct: z.number().int().min(0).max(100).nullable(),
  fallbackRan: z.boolean(),
  /** True when the cues were copied from the cache and no cue call was made. */
  fromCache: z.boolean(),
});

export type CueReport = z.infer<typeof CueReportSchema>;

/** Counts each drop reason, with zero for the reasons that did not occur. */
export function countDrops(dropped: readonly DroppedCue[]): Record<CueDropReason, number> {
  const counts = Object.fromEntries(CUE_DROP_REASONS.map((reason) => [reason, 0])) as Record<
    CueDropReason,
    number
  >;
  for (const drop of dropped) counts[drop.reason] += 1;
  return counts;
}

/**
 * Share of the chapter's estimated narration time that at least one cue covers, rounded to a whole
 * percent. Null when the chapter has no speech time to measure.
 */
export function coveragePercent(
  cues: readonly Pick<ValidatedCue, 'startSentence' | 'endSentence'>[],
  sentences: readonly SentenceInput[],
): number | null {
  let total = 0;
  let covered = 0;
  for (const sentence of sentences) {
    const seconds = estimateSpeechSeconds(sentence.text);
    total += seconds;
    if (cues.some((cue) => sentence.idx >= cue.startSentence && sentence.idx <= cue.endSentence)) {
      covered += seconds;
    }
  }
  if (total <= 0) return null;
  return Math.round((100 * covered) / total);
}

export interface BuildCueReportInput {
  readonly model: string;
  readonly promptVersion: string;
  readonly createdAt: number;
  readonly cues: readonly ValidatedCue[];
  readonly dropped: readonly DroppedCue[];
  readonly sentences: readonly SentenceInput[];
  readonly fallbackRan: boolean;
  readonly fromCache: boolean;
}

export function buildCueReport(input: BuildCueReportInput): CueReport {
  return {
    model: input.model,
    promptVersion: input.promptVersion,
    createdAt: input.createdAt,
    accepted: input.cues.length,
    droppedByReason: countDrops(input.dropped),
    coveragePct: coveragePercent(input.cues, input.sentences),
    fallbackRan: input.fallbackRan,
    fromCache: input.fromCache,
  };
}
