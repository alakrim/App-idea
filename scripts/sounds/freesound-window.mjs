// Frame levels for the Freesound beds (A4). Pure functions over decoded mono PCM: no ffmpeg, no network.
// The clean-window choice itself is in screen-policy.mjs, where the AudioSet tags and these levels meet.

/** dBFS of each complete frame of `frameSamples` samples, from the start. Trailing samples are dropped. */
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
