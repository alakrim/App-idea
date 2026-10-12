#!/usr/bin/env node
// Verifies the ambience packs against their manifests and the licence ledger. Run: npm run sounds:verify
// Covers the procedural base pack (assets/ambience/base) and the Freesound CC0 beds (assets/ambience/real).
// Exits non-zero if any check fails. Checks per file: exists, sha256/bytes match, duration, integrated
// loudness, true peak, seam continuity (RMS and sample jump), and a licence row. Real beds also need a
// CC0 ledger row that matches their manifest entry, and the app must require every one of them.

import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import { decodeMono, measureLoudness, sha256File } from './ffmpeg-tools.mjs';
import { FREESOUND_TARGETS } from './freesound-targets.mjs';
import { checkSeam } from './seam.mjs';
import {
  BASE_BED_IDS,
  CC0_LICENSE_URL,
  DURATION_TOLERANCE_MS,
  LEDGER_PATH,
  LOOP_SAMPLES,
  LUFS_TOLERANCE,
  MANIFEST_PATH,
  MAX_PACK_BYTES,
  MAX_REAL_PACK_BYTES,
  PACK_DIR,
  REAL_DIR,
  REAL_MANIFEST_PATH,
  REPO_ROOT,
  SAMPLE_RATE,
  TARGET_LUFS,
  TRUE_PEAK_MAX_DBTP,
} from './pack-spec.mjs';

const APP_BED_SOURCE = join(REPO_ROOT, 'src', 'audio', 'ambience-pack.ts');
const FREESOUND_LEDGER_PREFIX = 'https://freesound.org/';

const commonFields = {
  id: z.string(),
  file: z.string(),
  durationMs: z.number().int().positive(),
  loopStartMs: z.number().nonnegative(),
  loopEndMs: z.number().positive(),
  lufs: z.number(),
  bytes: z.number().int().positive(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  kind: z.literal('bed'),
  recipeVersion: z.string(),
};

const baseManifestSchema = z.array(z.object({ ...commonFields, source: z.literal('procedural') }));

const realManifestSchema = z.array(
  z.object({
    ...commonFields,
    source: z.literal('freesound'),
    freesoundId: z.number().int().positive(),
    author: z.string().min(1),
    url: z.string().url(),
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

/** Checks one bed file against its manifest row. Returns the failures and the printed metrics. */
async function verifyBed(entry, dir, ledgerIds) {
  const failures = [];
  const path = join(dir, entry.file);

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
  // Loop region: the file carries roll audio outside [loopStartMs, loopEndMs); seams are checked inside it.
  const regionStart = Math.round((entry.loopStartMs / 1000) * SAMPLE_RATE);
  const regionEnd = Math.round((entry.loopEndMs / 1000) * SAMPLE_RATE);
  if (regionEnd - regionStart !== LOOP_SAMPLES) {
    failures.push(`loop region is ${regionEnd - regionStart} samples, expected ${LOOP_SAMPLES}`);
  }
  if (regionEnd > samples.length) failures.push('loop region extends past the file');
  const loop = samples.subarray(regionStart, regionEnd);

  const { integratedLufs, truePeakDbtp } = await measureLoudness(path);
  if (Math.abs(integratedLufs - TARGET_LUFS) > LUFS_TOLERANCE) {
    failures.push(`loudness ${integratedLufs} LUFS outside ${TARGET_LUFS} +/- 1`);
  }
  if (truePeakDbtp > TRUE_PEAK_MAX_DBTP) {
    failures.push(`true peak ${truePeakDbtp} dBTP above ${TRUE_PEAK_MAX_DBTP}`);
  }

  const seam = checkSeam(loop);
  if (seam.rmsDiffDb > seam.limitDb) {
    failures.push(
      `seam dRMS ${seam.rmsDiffDb.toFixed(2)} dB exceeds ${seam.limitDb.toFixed(2)} dB (p99 ${seam.p99Db.toFixed(2)})`,
    );
  }
  if (!(seam.jumpRatio <= seam.jumpLimit)) {
    failures.push(
      `seam jump ${seam.jumpRatio.toFixed(2)}x exceeds ${seam.jumpLimit.toFixed(2)}x (p99.9 ${seam.jumpP999Ratio.toFixed(2)}x)`,
    );
  }

  return {
    id: entry.id,
    failures,
    metrics: {
      durationMs: decodedMs.toFixed(1),
      lufs: integratedLufs.toFixed(2),
      truePeak: truePeakDbtp.toFixed(2),
      seamRmsDb: seam.rmsDiffDb.toFixed(2),
      p99Db: seam.p99Db.toFixed(2),
      limitDb: seam.limitDb.toFixed(2),
      seamJump: seam.jumpRatio.toFixed(2),
      jumpP999: seam.jumpP999Ratio.toFixed(2),
      jumpLimit: seam.jumpLimit.toFixed(2),
      bytes: entry.bytes,
    },
  };
}

/** Licence rows for real beds: exact CC0 and the same source and author as the manifest. */
function checkRealLedger(entry, ledger) {
  const row = ledger.find((candidate) => candidate.id === entry.id);
  if (!row) return ['no licence ledger row'];
  const failures = [];
  if (!row.license.includes(CC0_LICENSE_URL))
    failures.push(`ledger licence "${row.license}" is not CC0`);
  if (row.source !== entry.url) failures.push('ledger source differs from the manifest URL');
  if (row.author !== entry.author) failures.push('ledger author differs from the manifest author');
  return failures;
}

/** Each real bed must be required by the app bundle, or Metro never ships it. */
async function checkAppCoverage(entries) {
  const source = await readFile(APP_BED_SOURCE, 'utf8');
  return entries
    .filter((entry) => !source.includes(`require('../../assets/ambience/real/${entry.file}')`))
    .map((entry) => `${entry.id}: src/audio/ambience-pack.ts does not require ${entry.file}`);
}

/** Prints one bed's result and returns the running failure flag. */
function recordResult(result, failed) {
  const status = result.failures.length === 0 ? 'PASS' : 'FAIL';
  console.log(`${status} ${result.id} ${JSON.stringify(result.metrics)}`);
  for (const failure of result.failures) console.log(`     - ${failure}`);
  return failed || result.failures.length > 0;
}

async function main() {
  const baseManifest = baseManifestSchema.parse(JSON.parse(await readFile(MANIFEST_PATH, 'utf8')));
  const realManifest = realManifestSchema.parse(
    JSON.parse(await readFile(REAL_MANIFEST_PATH, 'utf8')),
  );
  const ledger = ledgerSchema.parse(JSON.parse(await readFile(LEDGER_PATH, 'utf8')));
  const ledgerIds = new Set(ledger.map((row) => row.id));
  let failed = false;

  // Base pack: the same ids, total size and per-bed checks as before.
  const baseIds = baseManifest.map((e) => e.id).sort();
  const expectedBaseIds = [...BASE_BED_IDS].sort();
  if (baseIds.join(',') !== expectedBaseIds.join(',')) {
    console.log(
      `FAIL base manifest ids ${baseIds.join(',')} != expected ${expectedBaseIds.join(',')}`,
    );
    failed = true;
  }
  const baseBytes = baseManifest.reduce((sum, e) => sum + e.bytes, 0);
  const baseSizeOk = baseBytes < MAX_PACK_BYTES;
  console.log(
    `${baseSizeOk ? 'PASS' : 'FAIL'} base pack total ${baseBytes} bytes (limit ${MAX_PACK_BYTES})`,
  );
  if (!baseSizeOk) failed = true;
  for (const entry of baseManifest) {
    failed = recordResult(await verifyBed(entry, PACK_DIR, ledgerIds), failed);
  }

  // Freesound beds: one per target, CC0 ledger rows, app coverage, size budget.
  const realIds = realManifest.map((e) => e.id).sort();
  const expectedRealIds = FREESOUND_TARGETS.map((t) => t.id).sort();
  if (realIds.join(',') !== expectedRealIds.join(',')) {
    console.log(
      `FAIL real manifest ids ${realIds.join(',')} != targets ${expectedRealIds.join(',')}`,
    );
    failed = true;
  }
  const realBytes = realManifest.reduce((sum, e) => sum + e.bytes, 0);
  const realSizeOk = realBytes <= MAX_REAL_PACK_BYTES;
  console.log(
    `${realSizeOk ? 'PASS' : 'FAIL'} real beds total ${realBytes} bytes (budget ${MAX_REAL_PACK_BYTES})`,
  );
  if (!realSizeOk) failed = true;

  const orphanRows = ledger.filter(
    (row) =>
      row.source.startsWith(FREESOUND_LEDGER_PREFIX) &&
      !realManifest.some((entry) => entry.id === row.id),
  );
  for (const row of orphanRows) {
    console.log(`FAIL ledger row ${row.id} is a Freesound row with no manifest entry`);
    failed = true;
  }

  for (const entry of realManifest) {
    const ledgerFailures = checkRealLedger(entry, ledger);
    const result = await verifyBed(entry, REAL_DIR, ledgerIds);
    failed = recordResult({ ...result, failures: [...ledgerFailures, ...result.failures] }, failed);
  }
  const coverage = await checkAppCoverage(realManifest);
  for (const message of coverage) {
    console.log(`FAIL ${message}`);
    failed = true;
  }

  console.log(failed ? 'verify-pack: FAILED' : 'verify-pack: all checks passed');
  process.exitCode = failed ? 1 : 0;
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
