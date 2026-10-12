// The seamless-loop recipe shared by the procedural base pack and the Freesound beds (ADR-0005, R4 5.3).
// Every step is an ffmpeg argument array. The functions only build graphs or run ffmpeg; they do not
// decide what to keep. Callers own the file names and the checks.

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
/**
 * A loose LRA target keeps loudnorm in linear (constant-gain) mode. With a tight target (11 LU) the
 * ocean swell measured 11.1 LU, loudnorm switched to dynamic mode, and it reshaped the envelopes.
 */
const LRA_TARGET = 20;

/**
 * Equal-power loop over the window that starts at `startSample` of the input: the tail fades out
 * while the head fades in, then the head is replaced by the crossfade. `prefix` is an optional
 * filter chain run on the input before the window is cut (for example a high-pass).
 */
export function loopGraph({ startSample, prefix = '' }) {
  const x = CROSSFADE_SECONDS;
  return [
    `[0:a]${prefix}atrim=start_sample=${startSample}:end_sample=${startSample + WINDOW_SAMPLES},asetpts=PTS-STARTPTS,asplit=3[w1][w2][w3]`,
    `[w1]atrim=start_sample=${LOOP_SAMPLES},asetpts=PTS-STARTPTS,afade=t=out:st=0:d=${x}:curve=qsin[tail]`,
    `[w2]atrim=end_sample=${CROSSFADE_SAMPLES},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=${x}:curve=qsin[head]`,
    '[tail][head]amix=inputs=2:duration=first:weights=1 1:normalize=0[xf]',
    `[w3]atrim=start_sample=${CROSSFADE_SAMPLES}:end_sample=${LOOP_SAMPLES},asetpts=PTS-STARTPTS[rest]`,
    '[xf][rest]concat=n=2:v=0:a=1[out]',
  ].join(';');
}

/** Adds ROLL_SAMPLES of loop audio before and after the loop, so the encoder sees no onset at its edges. */
export function rollGraph() {
  return [
    '[0:a]asplit=3[s1][s2][s3]',
    `[s1]atrim=start_sample=${LOOP_SAMPLES - ROLL_SAMPLES},asetpts=PTS-STARTPTS[pre]`,
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

/** Pass 2 of two-pass loudnorm: applies the measured linear gain to the target. */
export function loudnormPass2(m) {
  return [
    `loudnorm=I=${TARGET_LUFS}:TP=${TRUE_PEAK_MAX_DBTP}:LRA=${LRA_TARGET}`,
    `measured_I=${m.I}:measured_TP=${m.TP}:measured_LRA=${m.LRA}:measured_thresh=${m.thresh}`,
    `offset=${m.offset}:linear=true:print_format=summary`,
  ].join(':');
}

/** Applies the rolls to a loop WAV, writing a float WAV. */
export async function rollLoop(loopWav, rolledWav) {
  await runFfmpeg([
    '-y',
    '-i',
    loopWav,
    '-filter_complex',
    rollGraph(),
    '-map',
    '[out]',
    '-c:a',
    'pcm_f32le',
    rolledWav,
  ]);
}

/** Pass 2: normalizes the rolled loop with the measured gain and encodes AAC-LC mono 64 kbps .m4a. */
export async function encodeLoopAac(rolledWav, measured, encodedM4a) {
  await runFfmpeg([
    '-y',
    '-i',
    rolledWav,
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
    encodedM4a,
  ]);
}
