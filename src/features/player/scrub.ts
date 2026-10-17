// Every helper here runs inside the scrubber's gesture and animated styles on the UI thread, so each
// one is a worklet. Calling a plain JS function there crashes the app on device.

// Declared first: the worklets plugin turns worklet functions into constants, which are not hoisted.
function clamp01(value: number): number {
  'worklet';
  return Math.min(1, Math.max(0, value));
}

/** Each 15 s step crossed while scrubbing ticks a haptic and is announced to assistive tech. */
export const SCRUB_STEP_MS = 15_000;

/** Precision bands for a drag, by how far the finger has moved off the track vertically. */
const FINE_BANDS: readonly { beyondPx: number; sensitivity: number }[] = [
  { beyondPx: 120, sensitivity: 0.15 },
  { beyondPx: 40, sensitivity: 0.4 },
  { beyondPx: 0, sensitivity: 1 },
];

/**
 * How many track-widths of drag map to the whole chapter. Dragging down away from the track slows
 * the scrub, so a long chapter can be placed to the second.
 */
export function scrubSensitivity(verticalOffsetPx: number): number {
  'worklet';
  const distance = Math.abs(verticalOffsetPx);
  const band = FINE_BANDS.find((candidate) => distance >= candidate.beyondPx);
  return band?.sensitivity ?? 1;
}

/** The fraction (0 to 1) after dragging `dxPx` from a starting fraction. */
export function scrubFraction(
  startFraction: number,
  dxPx: number,
  trackWidthPx: number,
  sensitivity: number,
): number {
  'worklet';
  if (trackWidthPx <= 0) return clamp01(startFraction);
  return clamp01(startFraction + (dxPx / trackWidthPx) * sensitivity);
}

export function fractionToMs(fraction: number, durationMs: number): number {
  'worklet';
  return Math.round(clamp01(fraction) * Math.max(0, durationMs));
}

export function msToFraction(ms: number, durationMs: number): number {
  'worklet';
  if (durationMs <= 0) return 0;
  return clamp01(ms / durationMs);
}

/**
 * Keeps a scrub position inside the buffer band, which is the audio made so far. `capped` says the
 * finger went past the band, the moment for a light haptic.
 */
export interface BufferClamp {
  fraction: number;
  capped: boolean;
}

export function clampToBuffer(fraction: number, bufferFraction: number): BufferClamp {
  'worklet';
  return { fraction: Math.min(fraction, bufferFraction), capped: fraction > bufferFraction };
}

/** The 15 s step index a position falls in. Crossing a boundary is what earns a haptic tick. */
export function scrubStep(ms: number): number {
  'worklet';
  return Math.floor(Math.max(0, ms) / SCRUB_STEP_MS);
}
