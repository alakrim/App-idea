import type { AmbienceCue, AmbienceIntensity } from '../domain/analysis';

/** At most two beds sound at once (ADR-0005). */
export const MAX_BEDS = 2;
/** Default bed level relative to narration (ADR-0005). */
export const DEFAULT_BED_LEVEL_DB = -22;
/**
 * Assumed loudness of the narration, in LUFS. This is an estimate of typical TTS output. M8 will
 * measure it per segment. Beds sit `levelDb` below this reference, whatever their own loudness.
 */
export const NARRATION_REF_LUFS = -18;
/** Loudness the base pack is normalized to (ADR-0005, A1). Used when a bed's loudness is unknown. */
export const BED_TARGET_LUFS = -28;
/** The relative level (levelDb plus intensity) is clamped to this range before loudness is applied. */
const RELATIVE_MIN_DB = -30;
const RELATIVE_MAX_DB = -12;
const RETARGET_RAMP_MS = 400;
const GAIN_EPSILON_DB = 0.01;

export const INTENSITY_OFFSET_DB: Readonly<Record<AmbienceIntensity, number>> = {
  low: -3,
  medium: 0,
  high: 3,
};

/** A bed that should be sounding at the current sentence. */
export interface BedTarget {
  cueId: string;
  category: string;
  gainDb: number;
  /** Fade-in duration when the bed starts. */
  fadeInMs: number;
  /** Fade-out duration when the bed stops. */
  fadeOutMs: number;
}

export type BedCommand =
  | { type: 'start'; cueId: string; category: string; gainDb: number; fadeMs: number }
  | { type: 'stop'; cueId: string; fadeMs: number }
  | { type: 'retarget'; cueId: string; gainDb: number; rampMs: number };

/**
 * File gain for one bed. The relative level (`levelDb` plus intensity) is clamped to [-30, -12] dB
 * relative to the narration. The gain then places that level against the reference narration
 * loudness, and removes the bed's own loudness, so beds of different loudness sound equally loud.
 */
export function bedGainDb(
  levelDb: number,
  intensity: AmbienceIntensity,
  bedLufs: number = BED_TARGET_LUFS,
): number {
  const raw = levelDb + INTENSITY_OFFSET_DB[intensity];
  const relative = Math.min(RELATIVE_MAX_DB, Math.max(RELATIVE_MIN_DB, raw));
  return NARRATION_REF_LUFS + relative - bedLufs;
}

export interface PlanOptions {
  /** Base bed level relative to the narration, in dB. */
  levelDb?: number;
  /** Integrated loudness of the bed a category resolves to. Null or missing means the target. */
  bedLufs?: (category: string) => number | null;
}

/**
 * Beds that should sound at `sentenceIdx`. Only enabled cues whose sentence range covers the index
 * qualify. Higher confidence wins, and ties break on the earlier start and then on the id, so the
 * result is deterministic.
 */
export function planBeds(
  cues: readonly AmbienceCue[],
  sentenceIdx: number,
  options: PlanOptions = {},
): BedTarget[] {
  if (sentenceIdx < 0) return [];
  const levelDb = options.levelDb ?? DEFAULT_BED_LEVEL_DB;
  return cues
    .filter(
      (cue) => cue.enabled && cue.startSentence <= sentenceIdx && sentenceIdx <= cue.endSentence,
    )
    .sort(
      (a, b) =>
        b.confidence - a.confidence ||
        a.startSentence - b.startSentence ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )
    .slice(0, MAX_BEDS)
    .map((cue) => ({
      cueId: cue.id,
      category: cue.category,
      gainDb: bedGainDb(levelDb, cue.intensity, options.bedLufs?.(cue.category) ?? BED_TARGET_LUFS),
      fadeInMs: cue.fadeInMs,
      fadeOutMs: cue.fadeOutMs,
    }));
}

/**
 * Commands that move the sounding beds from `prev` to `next`. Stops come first so the bed limit
 * holds while the new beds start. A bed whose category changes is stopped and restarted.
 * Applying the commands to `prev` always yields exactly `next`, so no bed is orphaned.
 */
export function diffBeds(prev: readonly BedTarget[], next: readonly BedTarget[]): BedCommand[] {
  const prevById = new Map(prev.map((bed) => [bed.cueId, bed]));
  const nextById = new Map(next.map((bed) => [bed.cueId, bed]));
  const commands: BedCommand[] = [];

  for (const bed of prev) {
    const successor = nextById.get(bed.cueId);
    if (!successor || successor.category !== bed.category) {
      commands.push({ type: 'stop', cueId: bed.cueId, fadeMs: bed.fadeOutMs });
    }
  }
  for (const bed of next) {
    const predecessor = prevById.get(bed.cueId);
    if (!predecessor || predecessor.category !== bed.category) {
      commands.push({
        type: 'start',
        cueId: bed.cueId,
        category: bed.category,
        gainDb: bed.gainDb,
        fadeMs: bed.fadeInMs,
      });
    } else if (Math.abs(predecessor.gainDb - bed.gainDb) > GAIN_EPSILON_DB) {
      commands.push({
        type: 'retarget',
        cueId: bed.cueId,
        gainDb: bed.gainDb,
        rampMs: RETARGET_RAMP_MS,
      });
    }
  }
  return commands;
}
