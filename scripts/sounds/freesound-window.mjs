// Picks the steadiest loop-length window of a Freesound clip (A3 step 3). Pure functions over decoded
// mono PCM: no ffmpeg, no network.

/** Analysis frames are 100 ms: coarse enough to be cheap, fine enough to trim a handful of frames. */
export const FRAME_SECONDS = 0.1;
/** Edges quieter than the clip median by this much are silence. */
export const QUIET_EDGE_DB = 20;
/** Edges louder than the clip median by this much are a knock, a click or a mic hand-off. */
export const LOUD_EDGE_DB = 12;
/** Trimming never removes more than this much from one end. */
export const MAX_EDGE_TRIM_SECONDS = 10;

/** dBFS of each complete analysis frame. Frames are `frameSamples` long, from the start. */
export function frameLevelsDb(samples, frameSamples) {
  const frames = Math.floor(samples.length / frameSamples);
  const levels = new Float64Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    const base = f * frameSamples;
    for (let i = 0; i < frameSamples; i++) sum += samples[base + i] * samples[base + i];
    levels[f] = 10 * Math.log10(Math.max(sum / frameSamples, 1e-18));
  }
  return levels;
}

function median(values) {
  const sorted = Float64Array.from(values).sort();
  return sorted[sorted.length >> 1];
}

/**
 * The frame range [start, end) left after removing silent or noisy edges. An edge frame is dropped
 * when it sits more than QUIET_EDGE_DB below or LOUD_EDGE_DB above the clip's median level. Trimming
 * stops at the first frame that belongs to the body, and never removes more than MAX_EDGE_TRIM_SECONDS
 * from either end.
 */
export function usableFrameRange(levels) {
  if (levels.length === 0) return { start: 0, end: 0 };
  const body = median(levels);
  const maxTrim = Math.round(MAX_EDGE_TRIM_SECONDS / FRAME_SECONDS);
  const isEdgeNoise = (db) => db < body - QUIET_EDGE_DB || db > body + LOUD_EDGE_DB;

  let start = 0;
  while (start < Math.min(maxTrim, levels.length) && isEdgeNoise(levels[start])) start++;
  let end = levels.length;
  while (end > start && end > levels.length - maxTrim && isEdgeNoise(levels[end - 1])) end--;
  return { start, end };
}

/**
 * The start frame of the `windowFrames`-long window inside `range` whose frame levels vary least
 * (population standard deviation of dB). Ties go to the earlier window. Returns null when the usable
 * range is shorter than the window. Prefix sums make the search linear in the clip length.
 */
export function steadiestWindow(levels, range, windowFrames) {
  if (range.end - range.start < windowFrames) return null;
  const prefix = new Float64Array(levels.length + 1);
  const prefixSquares = new Float64Array(levels.length + 1);
  for (let i = 0; i < levels.length; i++) {
    prefix[i + 1] = prefix[i] + levels[i];
    prefixSquares[i + 1] = prefixSquares[i] + levels[i] * levels[i];
  }

  let best = null;
  for (let start = range.start; start + windowFrames <= range.end; start++) {
    const end = start + windowFrames;
    const mean = (prefix[end] - prefix[start]) / windowFrames;
    const variance = (prefixSquares[end] - prefixSquares[start]) / windowFrames - mean * mean;
    const stdDb = Math.sqrt(Math.max(0, variance));
    if (best === null || stdDb < best.stdDb) best = { startFrame: start, stdDb };
  }
  return best;
}
