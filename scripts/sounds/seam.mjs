// Seam statistics on decoded loop PCM (ADR-0005, A1). The build reports them and refuses a bed that
// fails; verify-pack recomputes them from the shipped files. Both read the same thresholds.

import {
  SAMPLE_RATE,
  SEAM_JUMP_PERCENTILE,
  SEAM_RMS_FLOOR_DB,
  SEAM_RMS_PERCENTILE,
  SEAM_SPIKE_RATIO,
  SEAM_WINDOW_SECONDS,
} from './pack-spec.mjs';

const rms = (x, from, to) => {
  let sum = 0;
  for (let i = from; i < to; i++) sum += x[i] * x[i];
  return Math.sqrt(sum / (to - from));
};

/**
 * Seam checks on decoded PCM.
 * - Level: |dRMS| between the last and first 50 ms windows. The limit is max(floor, p99) where p99 is
 *   taken over |dRMS| between adjacent non-overlapping 50 ms windows elsewhere in the same file.
 *   Low-frequency beds vary that much naturally, so a fixed 2 dB limit alone is too strict for them.
 * - Jump: the wrap sample step against the median sample step. The limit is max(6x, p99.9 of the
 *   internal sample steps / median), the same statistical treatment as the level rule.
 */
export function checkSeam(x) {
  const win = Math.round(SEAM_WINDOW_SECONDS * SAMPLE_RATE);
  const dbOf = (from, to) => 20 * Math.log10(Math.max(rms(x, from, to), 1e-9));

  const windows = Math.floor(x.length / win);
  const levels = new Float64Array(windows);
  for (let k = 0; k < windows; k++) levels[k] = dbOf(k * win, (k + 1) * win);
  const internal = new Float64Array(windows - 1);
  for (let k = 0; k + 1 < windows; k++) internal[k] = Math.abs(levels[k + 1] - levels[k]);
  internal.sort();
  const p99 = internal[Math.ceil(SEAM_RMS_PERCENTILE * (internal.length - 1))];

  const rmsDiffDb = Math.abs(dbOf(x.length - win, x.length) - dbOf(0, win));
  const limitDb = Math.max(SEAM_RMS_FLOOR_DB, p99);

  const deltas = new Float32Array(x.length - 1);
  for (let i = 1; i < x.length; i++) deltas[i - 1] = Math.abs(x[i] - x[i - 1]);
  const sortedDeltas = Float32Array.from(deltas).sort();
  const medianDelta = sortedDeltas[sortedDeltas.length >> 1];
  const wrapJump = Math.abs(x[0] - x[x.length - 1]);
  const jumpRatio = medianDelta > 0 ? wrapJump / medianDelta : Number.POSITIVE_INFINITY;
  const jumpP999Ratio =
    medianDelta > 0
      ? sortedDeltas[Math.ceil(SEAM_JUMP_PERCENTILE * (sortedDeltas.length - 1))] / medianDelta
      : Number.POSITIVE_INFINITY;
  // A silent loop has no median step, so the jump limit is 0 and the seam fails.
  const jumpLimit = medianDelta > 0 ? Math.max(SEAM_SPIKE_RATIO, jumpP999Ratio) : 0;

  return { rmsDiffDb, p99Db: p99, limitDb, jumpRatio, jumpP999Ratio, jumpLimit };
}

/** True when the seam passes both rules. */
export function seamPasses(seam) {
  return seam.rmsDiffDb <= seam.limitDb && seam.jumpRatio <= seam.jumpLimit;
}
