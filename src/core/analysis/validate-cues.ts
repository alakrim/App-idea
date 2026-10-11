import { getCategory, isEnabledKind } from './ambience-taxonomy';
import { CUE_LIMITS } from './limits';
import { ambienceCategoryIdSchema, rawCueSchema } from './schemas';
import { estimateSpeechSeconds } from '../text/speech-rate';

import type { AmbienceCategoryId } from './ambience-taxonomy';
import type { IntensityLevel, SentenceInput, ValidatedCue } from './types';

export type CueDropReason =
  | 'malformed'
  | 'unknown_category'
  | 'category_not_enabled'
  | 'low_confidence'
  | 'invalid_span'
  | 'too_short'
  | 'merged'
  | 'overlap_limit'
  | 'density_cap';

export interface DroppedCue {
  /** The cue as received from the model (or a merged candidate), for debugging. Never logged with text. */
  readonly cue: unknown;
  readonly reason: CueDropReason;
}

export interface CueValidationContext {
  /** Number of sentences in the chapter. Valid indices are 0..sentenceCount-1. */
  readonly sentenceCount: number;
  /** Chapter word count from estimateWordCount (CJK-aware), used by the density cap. */
  readonly wordCount: number;
  /** The chapter's sentences (or every sentence of the chapter), used to estimate narration time. */
  readonly sentences: readonly SentenceInput[];
}

export interface CueValidationResult {
  readonly cues: ValidatedCue[];
  readonly dropped: DroppedCue[];
}

/** Fades come from defaults by intensity, never from the model (ADR-0005, R4 section 3). */
export const FADES_BY_INTENSITY: Readonly<
  Record<IntensityLevel, { readonly fadeInMs: number; readonly fadeOutMs: number }>
> = {
  low: { fadeInMs: 3000, fadeOutMs: 3500 },
  medium: { fadeInMs: 2500, fadeOutMs: 3000 },
  high: { fadeInMs: 2000, fadeOutMs: 2500 },
};

const INTENSITY_ORDER: readonly IntensityLevel[] = ['low', 'medium', 'high'];

type CueDraft = Omit<ValidatedCue, 'fadeInMs' | 'fadeOutMs' | 'category'> & {
  readonly category: AmbienceCategoryId;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Rounds to integer indices and clamps them into the chapter. Null when the span is empty. */
function clampRange(
  start: number,
  end: number,
  sentenceCount: number,
): { start: number; end: number } | null {
  if (sentenceCount <= 0) return null;
  const s = clamp(Math.round(start), 0, sentenceCount - 1);
  const e = clamp(Math.round(end), 0, sentenceCount - 1);
  return s > e ? null : { start: s, end: e };
}

function truncateChars(text: string, max: number): string {
  const chars = [...text];
  return chars.length <= max ? text : chars.slice(0, max).join('').trimEnd();
}

/**
 * Applies ADR-0005 to the cues from the model. Order of rules: schema and category, confidence
 * floor, index clamping, minimum span, merge of same-category neighbours, density cap and at most
 * two overlapping beds (highest confidence wins). Fades are attached last, by intensity.
 */
export function validateCues(
  rawCues: readonly unknown[],
  ctx: CueValidationContext,
): CueValidationResult {
  const dropped: DroppedCue[] = [];
  const drop = (cue: unknown, reason: CueDropReason): void => {
    dropped.push({ cue, reason });
  };
  const secondsByIdx = new Map<number, number>(
    ctx.sentences.map((s) => [s.idx, estimateSpeechSeconds(s.text)]),
  );

  const candidates: CueDraft[] = [];
  for (const raw of rawCues) {
    const parsed = rawCueSchema.safeParse(raw);
    if (!parsed.success) {
      drop(raw, 'malformed');
      continue;
    }
    const cue = parsed.data;
    const known = ambienceCategoryIdSchema.safeParse(cue.category);
    const category = known.success ? getCategory(known.data) : undefined;
    if (!category) {
      drop(raw, 'unknown_category');
      continue;
    }
    if (!isEnabledKind(category.kind)) {
      drop(raw, 'category_not_enabled');
      continue;
    }

    const confidence = clamp(cue.confidence, 0, 1);
    if (confidence < CUE_LIMITS.confidenceFloor) {
      drop(raw, 'low_confidence');
      continue;
    }

    const range = clampRange(cue.startSentence, cue.endSentence, ctx.sentenceCount);
    if (!range) {
      drop(raw, 'invalid_span');
      continue;
    }

    let seconds = 0;
    for (let i = range.start; i <= range.end; i += 1) seconds += secondsByIdx.get(i) ?? 0;
    const sentences = range.end - range.start + 1;
    if (sentences < CUE_LIMITS.minSentences || seconds < CUE_LIMITS.minSeconds) {
      drop(raw, 'too_short');
      continue;
    }

    candidates.push({
      category: category.id as AmbienceCategoryId,
      startSentence: range.start,
      endSentence: range.end,
      intensity: cue.intensity ?? 'medium',
      confidence,
      reason: truncateChars(cue.reason?.trim() ?? '', CUE_LIMITS.reasonChars),
    });
  }

  const merged = mergeAdjacent(candidates, drop);
  const accepted = applyDensityAndOverlap(merged, ctx, drop);

  const cues = accepted
    .sort((a, b) => a.startSentence - b.startSentence || a.category.localeCompare(b.category))
    .map((cue): ValidatedCue => ({ ...cue, ...FADES_BY_INTENSITY[cue.intensity] }));

  return { cues, dropped };
}

/**
 * Merges cues of the same category separated by at most `mergeGapSentences` sentences. The merged
 * cue keeps the higher confidence and the stronger intensity.
 */
function mergeAdjacent(
  candidates: readonly CueDraft[],
  drop: (cue: unknown, reason: CueDropReason) => void,
): CueDraft[] {
  const sorted = [...candidates].sort((a, b) => a.startSentence - b.startSentence);
  const out: CueDraft[] = [];
  const lastByCategory = new Map<AmbienceCategoryId, CueDraft>();

  for (const cue of sorted) {
    const last = lastByCategory.get(cue.category);
    const gap = last ? cue.startSentence - last.endSentence - 1 : Infinity;
    if (last && gap <= CUE_LIMITS.mergeGapSentences) {
      const stronger = cue.confidence > last.confidence ? cue : last;
      const merged: CueDraft = {
        category: cue.category,
        startSentence: last.startSentence,
        endSentence: Math.max(last.endSentence, cue.endSentence),
        intensity:
          INTENSITY_ORDER.indexOf(cue.intensity) > INTENSITY_ORDER.indexOf(last.intensity)
            ? cue.intensity
            : last.intensity,
        confidence: stronger.confidence,
        reason: stronger.reason,
      };
      drop(cue, 'merged');
      out[out.indexOf(last)] = merged;
      lastByCategory.set(cue.category, merged);
    } else {
      out.push(cue);
      lastByCategory.set(cue.category, cue);
    }
  }
  return out;
}

/**
 * Cues allowed for a chapter. Under 200 words: none. From 200 words: 2 per 1,000 words, floored,
 * and never fewer than one.
 */
export function maxCuesForWordCount(wordCount: number): number {
  if (wordCount < CUE_LIMITS.minWordsForCues) return 0;
  return Math.max(1, Math.floor((CUE_LIMITS.maxPer1kWords * wordCount) / 1000));
}

/**
 * Keeps cues by descending confidence while the chapter stays under the density cap
 * (see maxCuesForWordCount) and no sentence is covered by more than two beds.
 */
function applyDensityAndOverlap(
  candidates: readonly CueDraft[],
  ctx: CueValidationContext,
  drop: (cue: unknown, reason: CueDropReason) => void,
): CueDraft[] {
  const maxCues = maxCuesForWordCount(ctx.wordCount);
  const coverage = new Array<number>(Math.max(ctx.sentenceCount, 0)).fill(0);
  const ranked = [...candidates].sort(
    (a, b) => b.confidence - a.confidence || a.startSentence - b.startSentence,
  );
  const accepted: CueDraft[] = [];

  for (const cue of ranked) {
    let overlapping = false;
    for (let i = cue.startSentence; i <= cue.endSentence; i += 1) {
      if ((coverage[i] ?? 0) >= CUE_LIMITS.maxOverlappingBeds) overlapping = true;
    }
    if (overlapping) {
      drop(cue, 'overlap_limit');
      continue;
    }
    if (accepted.length >= maxCues) {
      drop(cue, 'density_cap');
      continue;
    }
    for (let i = cue.startSentence; i <= cue.endSentence; i += 1) {
      coverage[i] = (coverage[i] ?? 0) + 1;
    }
    accepted.push(cue);
  }
  return accepted;
}
