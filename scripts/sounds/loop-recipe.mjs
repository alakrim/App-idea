// The seamless-loop recipe shared by the procedural base pack and the Freesound beds (ADR-0005, R4 5.3).
// Every step is an ffmpeg argument array. The functions only build graphs or run ffmpeg; they do not
// decide what to keep. Callers own the file names and the checks.
//
// A loop is `loopSamples` long. Its source window is `windowSamples`, and the crossfade is the rest:
// window - loop. The base pack uses the 60 s loop with a 3 s crossfade (the defaults below). The A4
// Freesound beds may use a 45 s loop from a 46 s window (crossfade under 1 s) when no clean 64 s window
// exists. Every graph is built from the two lengths, so the base pack's graphs do not change.

import { runFfmpeg, runFfmpegCapture } from './ffmpeg-tools.mjs';
import {
  LOOP_SAMPLES,
  ROLL_SAMPLES,
  SAMPLE_RATE,
  TARGET_LUFS,
  TRUE_PEAK_MAX_DBTP,
} from './pack-spec.mjs';

export const CROSSFADE_SECONDS = 3;
export const CROSSFADE_SAMPLES = CROSSFADE_SECONDS * SAMPLE_RATE;
/** The loop source window: LOOP + CROSSFADE. The R4 recipe returns window - crossfade = LOOP. */
export const WINDOW_SAMPLES = LOOP_SAMPLES + CROSSFADE_SAMPLES;

/** The A4 short loop: 45 s of audio (whole AAC frames) from a 46 s window. */
export const SHORT_LOOP_SECONDS = 45;
export const SHORT_WINDOW_SECONDS = 46;
const SHORT_LOOP_SAMPLES =
  Math.round((SHORT_LOOP_SECONDS * SAMPLE_RATE) / 1024) * 1024;
export const SHORT_RECIPE = {
  loopSamples: SHORT_LOOP_SAMPLES,
  windowSamples: SHORT_WINDOW_SECONDS * SAMPLE_RATE,
};
export const LONG_RECIPE = { loopSamples: LOOP_SAMPLES, windowSamples: WINDOW_SAMPLES };

/**
 * A true-peak safety stage for the A4 beds only. It caps the sample peak at `ceilingDbtp` before the
 * loudness passes, so the linear second pass can reach the target instead of being held back by the
 * true-peak ceiling. Fast attack, 50 ms release: a gentle limit, not a compressor.
 */
export const LIMITER_CEILING_DBTP = -4;
export function limiterFilter(ceilingDbtp = LIMITER_CEILING_DBTP) {
  return `alimiter=limit=${10 ** (ceilingDbtp / 20)}:attack=5:release=50:level=disabled`;
}

/**
 * A loose LRA target keeps loudnorm in linear (constant-gain) mode. With a tight target (11 LU) the
 * ocean swell measured 11.1 LU, loudnorm switched to dynamic mode, and it reshaped the envelopes.
 */
const LRA_TARGET = 20;

/**
 * Equal-power loop over the window that starts at `startSample` of the input: the tail fades out
 * while the head fades in, then the head is replaced by the crossfade. `prefix` is an optional
 * filter chain run on the input before the window is cut (for example a high-pass). The recipe
 * lengths default to the base pack's 60 s loop.
 */
export function loopGraph({
  startSample,
  prefix = '',
  loopSamples = LOOP_SAMPLES,
  windowSamples = WINDOW_SAMPLES,
}) {
  const crossfadeSamples = windowSamples - loopSamples;
  const x = crossfadeSamples / SAMPLE_RATE;
  return [
    `[0:a]${prefix}atrim=start_sample=${startSample}:end_sample=${startSample + windowSamples},asetpts=PTS-STARTPTS,asplit=3[w1][w2][w3]`,
    `[w1]atrim=start_sample=${loopSamples},asetpts=PTS-STARTPTS,afade=t=out:st=0:d=${x}:curve=qsin[tail]`,
    `[w2]atrim=end_sample=${crossfadeSamples},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=${x}:curve=qsin[head]`,
    '[tail][head]amix=inputs=2:duration=first:weights=1 1:normalize=0[xf]',
    `[w3]atrim=start_sample=${crossfadeSamples}:end_sample=${loopSamples},asetpts=PTS-STARTPTS[rest]`,
    '[xf][rest]concat=n=2:v=0:a=1[out]',
  ].join(';');
}

/** Adds ROLL_SAMPLES of loop audio before and after the loop, so the encoder sees no onset at its edges. */
export function rollGraph(loopSamples = LOOP_SAMPLES) {
  return [
    '[0:a]asplit=3[s1][s2][s3]',
    `[s1]atrim=start_sample=${loopSamples - ROLL_SAMPLES},asetpts=PTS-STARTPTS[pre]`,
    '[s2]asetpts=PTS-STARTPTS[body]',
    `[s3]atrim=end_sample=${ROLL_SAMPLES},asetpts=PTS-STARTPTS[post]`,
    '[pre][body][post]concat=n=3:v=0:a=1[out]',
  ].join(';');
}

/** Pass 1 of two-pass loudnorm: measures a file. */
export async function measureLoudnorm(file) {
  const stderr = await runFfmpegCapture([
    '-i',
    file,
    '-af',
    `loudnorm=I=${TARGET_LUFS}:TP=${TRUE_PEAK_MAX_DBTP}:LRA=${LRA_TARGET}:print_format=json`,
    '-f',
    'null',
    '-',
  ]);
  const match = /\{[^{}]*"input_i"[^{}]*\}/.exec(stderr);
  if (!match) throw new Error(`loudnorm pass 1 produced no JSON for ${file}`);
  const m = JSON.parse(match[0]);
  return {
    I: m.input_i,
    TP: m.input_tp,
    LRA: m.input_lra,
    thresh: m.input_thresh,
    offset: m.target_offset,
  };
}

/**
 * Pass 2 of two-pass loudnorm: applies the measured linear gain to the target. `truePeakDbtp` is the
 * ceiling the gain must respect before encoding (the base pack uses the verify limit itself).
 */
export function loudnormPass2(m, truePeakDbtp = TRUE_PEAK_MAX_DBTP) {
  return [
    `loudnorm=I=${TARGET_LUFS}:TP=${truePeakDbtp}:LRA=${LRA_TARGET}`,
    `measured_I=${m.I}:measured_TP=${m.TP}:measured_LRA=${m.LRA}:measured_thresh=${m.thresh}`,
    `offset=${m.offset}:linear=true:print_format=summary`,
  ].join(':');
}

/** Applies the rolls to a loop WAV, writing a float WAV. */
export async function rollLoop(loopWav, rolledWav, loopSamples = LOOP_SAMPLES) {
  await runFfmpeg([
    '-y',
    '-i',
    loopWav,
    '-filter_complex',
    rollGraph(loopSamples),
    '-map',
    '[out]',
    '-c:a',
    'pcm_f32le',
    rolledWav,
  ]);
}

/** Runs the limiter over a loop WAV, writing a float WAV of the same length. */
export async function limitLoop(loopWav, limitedWav, ceilingDbtp = LIMITER_CEILING_DBTP) {
  await runFfmpeg([
    '-y',
    '-i',
    loopWav,
    '-af',
    limiterFilter(ceilingDbtp),
    '-c:a',
    'pcm_f32le',
    limitedWav,
  ]);
}

/**
 * Pass 2: normalizes the rolled loop with the measured gain and encodes AAC-LC mono .m4a at `bitrate`
 * (64 kbps for the base pack; the A4 real beds use 48 kbps, see the architect's size decision).
 * AAC can overshoot the true peak by a few tenths of a dB, so a caller may ask for more headroom.
 */
export async function encodeLoopAac(
  rolledWav,
  measured,
  encodedM4a,
  truePeakDbtp,
  bitrate = '64k',
) {
  await runFfmpeg([
    '-y',
    '-i',
    rolledWav,
    '-af',
    loudnormPass2(measured, truePeakDbtp),
    '-ac',
    '1',
    '-ar',
    String(SAMPLE_RATE),
    '-c:a',
    'aac',
    '-profile:a',
    'aac_low',
    '-b:a',
    bitrate,
    '-movflags',
    '+faststart',
    '-f',
    'ipod',
    encodedM4a,
  ]);
}
