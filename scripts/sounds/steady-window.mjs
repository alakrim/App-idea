// Picks the steadiest window of a sampled source (brief SND1: "pick the steadiest window"). Level is
// measured in whole blocks (1 s by default), and the window whose block levels vary least, in dB, wins.
// Silent or dropped-out blocks widen the spread, so they are avoided too.

const EPSILON_POWER = 1e-12;

/** Mean-square level of each complete block, in dB. */
export function blockLevelsDb(samples, blockSamples) {
  const blocks = Math.floor(samples.length / blockSamples);
  const levels = new Float64Array(blocks);
  for (let k = 0; k < blocks; k++) {
    let sum = 0;
    const from = k * blockSamples;
    for (let i = from; i < from + blockSamples; i++) sum += samples[i] * samples[i];
    levels[k] = 10 * Math.log10(sum / blockSamples + EPSILON_POWER);
  }
  return levels;
}

/**
 * The first sample of the window with the least level variation. `windowSamples` is rounded up to whole
 * blocks for the search, and the caller then cuts exactly `windowSamples` from that start.
 */
export function steadiestWindowStart(samples, windowSamples, blockSamples) {
  if (samples.length < windowSamples) {
    throw new Error(`source is ${samples.length} samples, shorter than the ${windowSamples}-sample window`);
  }
  const levels = blockLevelsDb(samples, blockSamples);
  const span = Math.ceil(windowSamples / blockSamples);
  let best = { block: 0, spread: Number.POSITIVE_INFINITY };
  for (let start = 0; start + span <= levels.length; start++) {
    const spread = standardDeviation(levels, start, start + span);
    if (spread < best.spread) best = { block: start, spread };
  }
  if (!Number.isFinite(best.spread)) throw new Error('source has no complete window to choose from');
  return best.block * blockSamples;
}

function standardDeviation(values, from, to) {
  const n = to - from;
  let mean = 0;
  for (let i = from; i < to; i++) mean += values[i];
  mean /= n;
  let variance = 0;
  for (let i = from; i < to; i++) variance += (values[i] - mean) ** 2;
  return Math.sqrt(variance / n);
}
