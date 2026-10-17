// The one loop recipe for every bed, procedural or sampled (ADR-0005, R4, brief SND1):
//   1. a seamless loop: an equal-power crossfade (qsin, 3 s) for noise, or a plain window for a periodic stem
//   2. an optional periodic tonal stem, mixed after the crossfade and never crossfaded
//   3. a roll of two AAC frames either side, so the encoder sees continuous audio at the loop edges
//   4. two-pass loudnorm to -28 LUFS (linear gain), with a true-peak ceiling of -3 dBTP
//   5. AAC-LC, mono, 44.1 kHz, 64 kbps, as .m4a
// Intermediates are raw 32-bit float mono at 44.1 kHz, so no WAV headers are involved.

import { join } from 'node:path';

import { decodeMono, measureLoudness, runFfmpeg, runFfmpegCapture, sha256File } from './ffmpeg-tools.mjs';
import {
  CROSSFADE_SAMPLES,
  CROSSFADE_SECONDS,
  LUFS_TOLERANCE,
  ROLL_SAMPLES,
  SAMPLE_RATE,
  TARGET_LUFS,
  TRUE_PEAK_MAX_DBTP,
} from './pack-spec.mjs';

/** A loop of this many samples is valid only on an AAC frame boundary. */
const SAMPLES_PER_FRAME = 1024;

const RAW_IN = (file) => ['-f', 'f32le', '-ar', String(SAMPLE_RATE), '-ac', '1', '-i', file];
const RAW_OUT = ['-ac', '1', '-ar', String(SAMPLE_RATE), '-f', 'f32le'];

/**
 * Filter graph that cuts one loop from input 0. With a crossfade, the window is loop + crossfade long
 * and its last crossfade samples are blended into its first (equal power). Output: [out].
 */
export function loopGraph({ start, loopSamples, crossfade }) {
  if (!crossfade) {
    return `[0:a]atrim=start_sample=${start}:end_sample=${start + loopSamples},asetpts=PTS-STARTPTS[out]`;
  }
  const windowEnd = start + loopSamples + CROSSFADE_SAMPLES;
  return [
    `[0:a]atrim=start_sample=${start}:end_sample=${windowEnd},asetpts=PTS-STARTPTS,asplit=3[w1][w2][w3]`,
    `[w1]atrim=start_sample=${loopSamples},asetpts=PTS-STARTPTS,afade=t=out:st=0:d=${CROSSFADE_SECONDS}:curve=qsin[tail]`,
    `[w2]atrim=end_sample=${CROSSFADE_SAMPLES},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=${CROSSFADE_SECONDS}:curve=qsin[head]`,
    '[tail][head]amix=inputs=2:duration=first:weights=1 1:normalize=0[xf]',
    `[w3]atrim=start_sample=${CROSSFADE_SAMPLES}:end_sample=${loopSamples},asetpts=PTS-STARTPTS[rest]`,
    '[xf][rest]concat=n=2:v=0:a=1[out]',
  ].join(';');
}

/** Adds ROLL_SAMPLES of loop audio before and after the loop. Output: [out]. */
export function rollGraph(loopSamples) {
  return [
    '[0:a]asplit=3[s1][s2][s3]',
    `[s1]atrim=start_sample=${loopSamples - ROLL_SAMPLES},asetpts=PTS-STARTPTS[pre]`,
    '[s2]asetpts=PTS-STARTPTS[body]',
    `[s3]atrim=end_sample=${ROLL_SAMPLES},asetpts=PTS-STARTPTS[post]`,
    '[pre][body][post]concat=n=3:v=0:a=1[out]',
  ].join(';');
}

/**
 * A loose LRA target keeps loudnorm in linear (constant-gain) mode. With a tight target (11 LU) the
 * ocean swell measured 11.1 LU, loudnorm switched to dynamic mode, and it reshaped the envelopes.
 */
const LRA_TARGET = 20;

/** Pass 1 of two-pass loudnorm: measure the loop. */
async function measureLoudnorm(rawFile) {
  const stderr = await runFfmpegCapture([
    ...RAW_IN(rawFile),
    '-af',
    `loudnorm=I=${TARGET_LUFS}:TP=${TRUE_PEAK_MAX_DBTP}:LRA=${LRA_TARGET}:print_format=json`,
    '-f',
    'null',
    '-',
  ]);
  const match = /\{[^{}]*"input_i"[^{}]*\}/.exec(stderr);
  if (!match) throw new Error(`loudnorm pass 1 produced no JSON for ${rawFile}`);
  const m = JSON.parse(match[0]);
  return { I: m.input_i, TP: m.input_tp, LRA: m.input_lra, thresh: m.input_thresh, offset: m.target_offset };
}

/** Pass 2: apply the linear gain measured in pass 1. */
function loudnormPass2(m) {
  return [
    `loudnorm=I=${TARGET_LUFS}:TP=${TRUE_PEAK_MAX_DBTP}:LRA=${LRA_TARGET}`,
    `measured_I=${m.I}:measured_TP=${m.TP}:measured_LRA=${m.LRA}:measured_thresh=${m.thresh}`,
    `offset=${m.offset}:linear=true:print_format=summary`,
  ].join(':');
}

/**
 * Encodes one bed. `noise` is raw f32 audio with a loop (or a crossfade window) starting at `start`.
 * `tonal` is a periodic stem graph whose output [tonal] is exactly one loop long. At least one is given.
 * Returns the encoded file and its measurements. Throws when a bed misses the loudness or peak targets.
 */
export async function encodeBed({ id, workDir, loopSamples, noise, tonal }) {
  if (loopSamples % SAMPLES_PER_FRAME !== 0) throw new Error(`${id}: loop is not frame aligned`);
  if (!noise && !tonal) throw new Error(`${id}: a bed needs noise, a tonal stem or both`);

  let loop = null;
  if (noise) {
    loop = join(workDir, `${id}.loop.f32`);
    await runFfmpeg([
      ...RAW_IN(noise.path),
      '-filter_complex',
      loopGraph({ start: noise.start, loopSamples, crossfade: noise.crossfade }),
      '-map',
      '[out]',
      ...RAW_OUT,
      loop,
    ]);
  }
  if (tonal) {
    const stem = join(workDir, `${id}.stem.f32`);
    await runFfmpeg(['-filter_complex', tonal.graph, '-map', '[tonal]', ...RAW_OUT, stem]);
    if (loop === null) {
      loop = stem;
    } else {
      // The stem is mixed after the crossfade, so it is never crossfaded (see bed-recipes.mjs).
      const mixed = join(workDir, `${id}.mixed.f32`);
      await runFfmpeg([
        ...RAW_IN(loop),
        ...RAW_IN(stem),
        '-filter_complex',
        `[0:a][1:a]amix=inputs=2:normalize=0:duration=first:weights=${tonal.noiseWeight} 1[out]`,
        '-map',
        '[out]',
        ...RAW_OUT,
        mixed,
      ]);
      loop = mixed;
    }
  }

  const rolled = join(workDir, `${id}.rolled.f32`);
  await runFfmpeg([...RAW_IN(loop), '-filter_complex', rollGraph(loopSamples), '-map', '[out]', ...RAW_OUT, rolled]);

  const measured = await measureLoudnorm(loop);
  const encoded = join(workDir, `${id}.m4a`);
  await runFfmpeg([
    ...RAW_IN(rolled),
    '-af',
    loudnormPass2(measured),
    '-ac',
    '1',
    '-ar',
    String(SAMPLE_RATE),
    '-c:a',
    'aac',
    '-profile:a',
    'aac_low',
    '-b:a',
    '64k',
    '-movflags',
    '+faststart',
    '-f',
    'ipod',
    encoded,
  ]);

  const samples = await decodeMono(encoded);
  const expectedSamples = 2 * ROLL_SAMPLES + loopSamples;
  if (samples.length !== expectedSamples) {
    throw new Error(`${id}: decoded ${samples.length} samples, expected ${expectedSamples}`);
  }
  const { integratedLufs, truePeakDbtp } = await measureLoudness(encoded);
  if (Math.abs(integratedLufs - TARGET_LUFS) > LUFS_TOLERANCE) {
    throw new Error(`${id}: integrated loudness ${integratedLufs} LUFS is outside the target`);
  }
  if (truePeakDbtp > TRUE_PEAK_MAX_DBTP) {
    throw new Error(`${id}: true peak ${truePeakDbtp} dBTP exceeds ${TRUE_PEAK_MAX_DBTP}`);
  }

  return {
    encodedPath: encoded,
    durationMs: Math.round((samples.length / SAMPLE_RATE) * 1000),
    loopStartMs: Math.round((ROLL_SAMPLES / SAMPLE_RATE) * 1e6) / 1000,
    loopEndMs: Math.round(((ROLL_SAMPLES + loopSamples) / SAMPLE_RATE) * 1e6) / 1000,
    lufs: Math.round(integratedLufs * 10) / 10,
    truePeakDbtp,
    sha256: await sha256File(encoded),
  };
}
