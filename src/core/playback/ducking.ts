/** ADR-0005: the voice ducks the beds by 6 to 9 dB. 7 dB is the middle of that range. */
export const DUCKING_DEFAULTS = { duckingDb: 7, attackMs: 30, releaseMs: 550 } as const;

export interface DuckEnvelopeInput {
  /** True while a segment is playing. Paused, loading and buffering voices are not active. */
  voiceActive: boolean;
  /** How far the beds drop while the voice is active, as a positive dB amount. */
  duckingDb: number;
  attackMs: number;
  releaseMs: number;
}

/** A gain ramp for the mixer's ducking node: move to `gainDb` over `rampMs`. */
export interface DuckRamp {
  gainDb: number;
  rampMs: number;
}

/**
 * The ducking ramp for the current voice state. Ducking attacks fast (30 ms) when the voice starts
 * and releases slowly (550 ms) when it stops, so speech stays clear without audible pumping.
 */
export function duckEnvelope(input: DuckEnvelopeInput): DuckRamp {
  if (!(input.duckingDb >= 0 && input.duckingDb <= 24)) {
    throw new RangeError(`duckingDb must be between 0 and 24, got ${input.duckingDb}`);
  }
  if (input.voiceActive) {
    return { gainDb: -input.duckingDb, rampMs: input.attackMs };
  }
  return { gainDb: 0, rampMs: input.releaseMs };
}

/** Converts a decibel gain to a linear amplitude factor. 0 dB is 1, and -inf dB is 0. */
export function dbToLinear(db: number): number {
  return 10 ** (db / 20);
}
