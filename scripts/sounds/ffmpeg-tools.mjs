// Helpers shared by the sound pack scripts. Every ffmpeg call is an argument array (no shell strings).

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

import { SAMPLE_RATE } from './pack-spec.mjs';

const execFileAsync = promisify(execFile);
const MAX_BUFFER = 256 * 1024 * 1024;

/** System ffmpeg by default (6.1 here). Set FFMPEG_PATH to pin a specific binary. */
export const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg';

function explain(err, args) {
  const tail = typeof err.stderr === 'string' ? err.stderr.slice(-1500) : String(err.message);
  return new Error(`ffmpeg ${args.slice(0, 4).join(' ')} ... failed:\n${tail}`);
}

/** Runs ffmpeg, rejects with the stderr tail on failure. */
export async function runFfmpeg(args) {
  const full = ['-hide_banner', '-nostdin', '-nostats', '-loglevel', 'error', ...args];
  try {
    await execFileAsync(FFMPEG, full, { maxBuffer: MAX_BUFFER });
  } catch (err) {
    throw explain(err, full);
  }
}

/** Runs ffmpeg at info level and resolves with stderr, used to read measurement output. */
export async function runFfmpegCapture(args) {
  const full = ['-hide_banner', '-nostdin', '-nostats', '-loglevel', 'info', ...args];
  try {
    const { stderr } = await execFileAsync(FFMPEG, full, { maxBuffer: MAX_BUFFER });
    return stderr;
  } catch (err) {
    throw explain(err, full);
  }
}

/** EBU R128 integrated loudness and true peak, from the ebur128 summary block. */
export async function measureLoudness(file) {
  const stderr = await runFfmpegCapture([
    '-i',
    file,
    '-af',
    'ebur128=peak=true',
    '-f',
    'null',
    '-',
  ]);
  const integrated = /Integrated loudness:\s*\n\s*I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/.exec(stderr);
  const truePeak = /True peak:\s*\n\s*Peak:\s*(-?\d+(?:\.\d+)?)\s*dBFS/.exec(stderr);
  if (!integrated || !truePeak) throw new Error(`could not parse ebur128 summary for ${file}`);
  return { integratedLufs: Number(integrated[1]), truePeakDbtp: Number(truePeak[1]) };
}

/**
 * Decodes an audio file to mono float32 PCM at SAMPLE_RATE (edit lists are honoured by ffmpeg).
 * `filter` is an optional ffmpeg audio filter chain applied while decoding.
 */
export async function decodeMono(file, filter = null) {
  const args = [
    '-hide_banner',
    '-nostdin',
    '-loglevel',
    'error',
    '-i',
    file,
    ...(filter ? ['-af', filter] : []),
    '-ac',
    '1',
    '-ar',
    String(SAMPLE_RATE),
    '-f',
    'f32le',
    '-',
  ];
  let stdout;
  try {
    ({ stdout } = await execFileAsync(FFMPEG, args, { encoding: 'buffer', maxBuffer: MAX_BUFFER }));
  } catch (err) {
    throw explain(err, args);
  }
  const bytes = stdout.byteLength - (stdout.byteLength % 4);
  // Copy into a fresh buffer so the Float32Array view is 4-byte aligned.
  return new Float32Array(stdout.buffer.slice(stdout.byteOffset, stdout.byteOffset + bytes));
}

export async function sha256File(file) {
  return createHash('sha256')
    .update(await readFile(file))
    .digest('hex');
}
