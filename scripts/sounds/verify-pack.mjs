#!/usr/bin/env node
// Verifies the procedural base pack against its manifest and ledger. Run: npm run sounds:verify
// Exits non-zero if any check fails. Checks per file: exists, sha256/bytes match, duration within
// tolerance, integrated loudness, true peak, seam continuity (RMS and sample-jump), and licence row.

import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import { decodeMono, measureLoudness, sha256File } from './ffmpeg-tools.mjs';
import {
  BASE_BED_IDS,
  DURATION_TOLERANCE_MS,
  LEDGER_PATH,
  LUFS_TOLERANCE,
  MANIFEST_PATH,
  MAX_PACK_BYTES,
  PACK_DIR,
  SAMPLE_RATE,
  SEAM_RMS_TOLERANCE_DB,
  SEAM_SPIKE_RATIO,
  SEAM_WINDOW_SECONDS,
  TARGET_LUFS,
  TRUE_PEAK_MAX_DBTP,
} from './pack-spec.mjs';

const manifestSchema = z.array(
  z.object({
    id: z.string(),
    file: z.string(),
    durationMs: z.number().int().positive(),
    loopStartMs: z.literal(0),
    loopEndMs: z.number().int().positive(),
    lufs: z.number(),
    bytes: z.number().int().positive(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    kind: z.literal('bed'),
    source: z.literal('procedural'),
    recipeVersion: z.string(),
  }),
);

const ledgerSchema = z.array(
  z.object({
    id: z.string(),
    file: z.string(),
    license: z.string().min(1),
    source: z.string().min(1),
    author: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
);

const rms = (x, from, to) => {
  let sum = 0;
  for (let i = from; i < to; i++) sum += x[i] * x[i];
  return Math.sqrt(sum / (to - from));
};

const median = (values) => {
  const sorted = Float32Array.from(values).sort();
  return sorted[sorted.length >> 1];
};

/** Seam checks on decoded PCM: RMS of the 50 ms before and after the wrap, and the wrap sample jump. */
function checkSeam(x) {
  const win = Math.round(SEAM_WINDOW_SECONDS * SAMPLE_RATE);
  const headRms = rms(x, 0, win);
  const tailRms = rms(x, x.length - win, x.length);
  const rmsDiffDb = Math.abs(20 * Math.log10(tailRms / headRms));

  const deltas = new Float32Array(x.length - 1);
  for (let i = 1; i < x.length; i++) deltas[i - 1] = Math.abs(x[i] - x[i - 1]);
  const medianDelta = median(deltas);
  const wrapJump = Math.abs(x[0] - x[x.length - 1]);
  const jumpRatio = medianDelta > 0 ? wrapJump / medianDelta : Number.POSITIVE_INFINITY;

  return { rmsDiffDb, jumpRatio };
}

async function verifyBed(entry, ledgerIds) {
  const failures = [];
  const path = join(PACK_DIR, entry.file);

  try {
    const { size } = await stat(path);
    if (size !== entry.bytes) failures.push(`bytes ${size} != manifest ${entry.bytes}`);
  } catch {
    return { id: entry.id, failures: [`missing file ${entry.file}`], metrics: {} };
  }
  if ((await sha256File(path)) !== entry.sha256) failures.push('sha256 differs from manifest');
  if (!ledgerIds.has(entry.id)) failures.push('no licence ledger row');

  const samples = await decodeMono(path);
  const decodedMs = (samples.length / SAMPLE_RATE) * 1000;
  if (Math.abs(decodedMs - entry.durationMs) > DURATION_TOLERANCE_MS) {
    failures.push(`duration ${decodedMs.toFixed(1)} ms outside ${entry.durationMs} +/- 50`);
  }

  const { integratedLufs, truePeakDbtp } = await measureLoudness(path);
  if (Math.abs(integratedLufs - TARGET_LUFS) > LUFS_TOLERANCE) {
    failures.push(`loudness ${integratedLufs} LUFS outside ${TARGET_LUFS} +/- 1`);
  }
  if (truePeakDbtp > TRUE_PEAK_MAX_DBTP) {
    failures.push(`true peak ${truePeakDbtp} dBTP above ${TRUE_PEAK_MAX_DBTP}`);
  }

  const seam = checkSeam(samples);
  if (seam.rmsDiffDb > SEAM_RMS_TOLERANCE_DB) {
    failures.push(`seam RMS differs by ${seam.rmsDiffDb.toFixed(2)} dB (limit 2)`);
  }
  if (!(seam.jumpRatio <= SEAM_SPIKE_RATIO)) {
    failures.push(`seam jump is ${seam.jumpRatio.toFixed(2)}x the median delta (limit 6)`);
  }

  return {
    id: entry.id,
    failures,
    metrics: {
      durationMs: decodedMs.toFixed(1),
      lufs: integratedLufs.toFixed(2),
      truePeak: truePeakDbtp.toFixed(2),
      seamRmsDb: seam.rmsDiffDb.toFixed(2),
      seamJump: seam.jumpRatio.toFixed(2),
      bytes: entry.bytes,
    },
  };
}

async function main() {
  const manifest = manifestSchema.parse(JSON.parse(await readFile(MANIFEST_PATH, 'utf8')));
  const ledger = ledgerSchema.parse(JSON.parse(await readFile(LEDGER_PATH, 'utf8')));
  const ledgerIds = new Set(ledger.map((row) => row.id));
  let exitCode = 0;

  const manifestIds = manifest.map((e) => e.id).sort();
  const expectedIds = [...BASE_BED_IDS].sort();
  if (manifestIds.join(',') !== expectedIds.join(',')) {
    console.log(`FAIL manifest ids ${manifestIds.join(',')} != expected ${expectedIds.join(',')}`);
    exitCode = 1;
  }

  const totalBytes = manifest.reduce((sum, e) => sum + e.bytes, 0);
  const sizeOk = totalBytes < MAX_PACK_BYTES;
  console.log(`${sizeOk ? 'PASS' : 'FAIL'} total ${totalBytes} bytes (limit ${MAX_PACK_BYTES})`);
  if (!sizeOk) exitCode = 1;

  for (const entry of manifest) {
    const result = await verifyBed(entry, ledgerIds);
    const status = result.failures.length === 0 ? 'PASS' : 'FAIL';
    console.log(`${status} ${entry.file} ${JSON.stringify(result.metrics)}`);
    for (const failure of result.failures) console.log(`     - ${failure}`);
    if (result.failures.length > 0) exitCode = 1;
  }

  console.log(exitCode === 0 ? 'verify-pack: all checks passed' : 'verify-pack: FAILED');
  process.exitCode = exitCode;
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
