/** An inclusive range of values. */
export interface ValueRange {
  readonly min: number;
  readonly max: number;
}

/**
 * Bed level relative to the narration, in dB. The settings, the player sheet and the audio engine
 * all use this one range (P1-3), so a saved value always fits the slider and the engine.
 */
export const BED_LEVEL_RANGE_DB: ValueRange = { min: -40, max: 0 };

/** How far beds dip under the voice, in dB. */
export const DUCKING_RANGE_DB: ValueRange = { min: 0, max: 24 };

/** Playback speed. Pitch is preserved by the voice player. */
export const PLAYBACK_RATE_RANGE: ValueRange = { min: 0.5, max: 2 };

/** Speed sliders move in these steps. */
export const PLAYBACK_RATE_STEP = 0.05;

export function clampToRange(value: number, range: ValueRange): number {
  return Math.min(range.max, Math.max(range.min, value));
}

/** True for finite values inside the range. NaN is never inside. */
export function isInRange(value: number, range: ValueRange): boolean {
  return value >= range.min && value <= range.max;
}
