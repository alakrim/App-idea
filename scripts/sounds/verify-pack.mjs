#!/usr/bin/env node
// Verifies the ambience pack against its manifest, its licence ledger and the app wiring. Run: npm run sounds:verify
// Exits non-zero if any check fails. Pack-wide: the expected ids (recipes plus picks), taxonomy ids, the
// requires in src/audio/ambience-pack.ts, the total size budget. Per file: exists, sha256/bytes match, duration,
// loop region (45 to 63 s, frame aligned), integrated loudness, true peak, seam continuity (RMS and sample
// jump), licence row, and for sampled beds a licence re-check against the source evidence.

import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import { PROCEDURAL_BED_IDS } from './bed-recipes.mjs';
import { decodeMono, measureLoudness, sha256File } from './ffmpeg-tools.mjs';
import { classifyLicence } from './licence.mjs';
import { readPicks } from './pack-manifest.mjs';
import {
  DURATION_TOLERANCE_MS,
  LEDGER_PATH,
  LOOP_SAMPLES,
  LUFS_TOLERANCE,
  MANIFEST_PATH,
  MAX_LOOP_SECONDS,
  MAX_PACK_BYTES,
  MIN_LOOP_SECONDS,
  PACK_DIR,
  REPO_ROOT,
  SAMPLE_RATE,
  SAMPLES_PER_AAC_FRAME,
  SEAM_JUMP_PERCENTILE,
  SEAM_RMS_FLOOR_DB,
  SEAM_RMS_PERCENTILE,
  SEAM_SPIKE_RATIO,
  SEAM_WINDOW_SECONDS,
  TARGET_LUFS,
  TRUE_PEAK_MAX_DBTP,
} from './pack-spec.mjs';

const TAXONOMY_PATH = join(REPO_ROOT, 'src', 'core', 'analysis', 'ambience-taxonomy.ts');
const APP_PACK_PATH = join(REPO_ROOT, 'src', 'audio', 'ambience-pack.ts');
const BED_REQUIRE = /^\s*'?([a-z0-9_]+)'?:\s*require\('\.\.\/\.\.\/assets\/ambience\/beds\/([^']+)'\)/gm;

const manifestSchema = z.array(
  z.discriminatedUnion('source', [
    z.object({
      source: z.literal('procedural'),
      ...baseFields(),
    }),
    z.object({
      source: z.literal('sampled'),
      ...baseFields(),
      title: z.string().min(1),
      author: z.string().min(1),
      sourceUrl: z.url(),
      license: z.string().min(1),
      licenseUrl: z.string().min(1),
      originalSha256: z.string().regex(/^[0-9a-f]{64}$/),
      downloadDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
  ]),
);

function baseFields() {
  return {
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
}

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

/**
 * Seam checks on decoded PCM.
 * - Level: |dRMS| between the last and first 50 ms windows. The limit is max(floor, p99) where p99 is
 *   taken over |dRMS| between adjacent non-overlapping 50 ms windows elsewhere in the same file.
 *   Low-frequency beds vary that much naturally, so a fixed 2 dB limit alone is too strict for them.
 * - Jump: the wrap sample step against the median sample step. The limit is max(6x, p99.9 of the
 *   internal sample steps / median), the same statistical treatment as the level rule.
 */
function checkSeam(x) {
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

/** Failures that need only the manifest row and the ledger, with no decoding. */
function checkRecord(entry, ledgerRow) {
  const failures = [];
  if (!ledgerRow) failures.push('no licence ledger row');
  if (ledgerRow && ledgerRow.file !== entry.file) failures.push(`ledger file ${ledgerRow.file} != ${entry.file}`);
  if (entry.source === 'sampled') {
    if (ledgerRow && ledgerRow.license !== entry.license) failures.push('ledger licence differs from manifest');
    const licence = classifyLicence({ name: entry.license, url: entry.licenseUrl });
    if (!licence.allowed) failures.push(`licence not allowed: ${licence.reason}`);
  }
  const loopSamples = Math.round(((entry.loopEndMs - entry.loopStartMs) / 1000) * SAMPLE_RATE);
  const minSamples = MIN_LOOP_SECONDS * SAMPLE_RATE;
  const maxSamples = MAX_LOOP_SECONDS * SAMPLE_RATE;
  if (loopSamples !== LOOP_SAMPLES || loopSamples < minSamples || loopSamples > maxSamples) {
    failures.push(`loop is ${(loopSamples / SAMPLE_RATE).toFixed(3)} s, expected ${MIN_LOOP_SECONDS} to ${MAX_LOOP_SECONDS} s`);
  }
  const startSample = Math.round((entry.loopStartMs / 1000) * SAMPLE_RATE);
  if (startSample % SAMPLES_PER_AAC_FRAME !== 0) failures.push('loop start is not on an AAC frame boundary');
  return failures;
}

async function verifyBed(entry, ledgerRow) {
  const failures = checkRecord(entry, ledgerRow);
  const path = join(PACK_DIR, entry.file);

  try {
    const { size } = await stat(path);
    if (size !== entry.bytes) failures.push(`bytes ${size} != manifest ${entry.bytes}`);
  } catch {
    return { id: entry.id, failures: [...failures, `missing file ${entry.file}`], metrics: {} };
  }
  if ((await sha256File(path)) !== entry.sha256) failures.push('sha256 differs from manifest');

  const samples = await decodeMono(path);
  const decodedMs = (samples.length / SAMPLE_RATE) * 1000;
  if (Math.abs(decodedMs - entry.durationMs) > DURATION_TOLERANCE_MS) {
    failures.push(`duration ${decodedMs.toFixed(1)} ms outside ${entry.durationMs} +/- 50`);
  }
  // Loop region: the file carries roll audio outside [loopStartMs, loopEndMs); seams are checked inside it.
  const regionStart = Math.round((entry.loopStartMs / 1000) * SAMPLE_RATE);
  const regionEnd = Math.round((entry.loopEndMs / 1000) * SAMPLE_RATE);
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
      limitDb: seam.limitDb.toFixed(2),
      seamJump: seam.jumpRatio.toFixed(2),
      jumpLimit: seam.jumpLimit.toFixed(2),
      bytes: entry.bytes,
    },
  };
}

/** The app must require every installed bed, from the same file the manifest names (ids match too). */
async function checkAppWiring(manifest) {
  const source = await readFile(APP_PACK_PATH, 'utf8');
  const wired = new Map([...source.matchAll(BED_REQUIRE)].map((m) => [m[1], m[2]]));
  const failures = [];
  for (const entry of manifest) {
    if (wired.get(entry.id) !== entry.file) failures.push(`${entry.id}: no require of ${entry.file} in ambience-pack.ts`);
  }
  const manifestIds = new Set(manifest.map((e) => e.id));
  for (const id of wired.keys()) {
    if (!manifestIds.has(id)) failures.push(`${id}: required by ambience-pack.ts but not in the manifest`);
  }
  return failures;
}

/** Every manifest id is a base-pack id or a taxonomy category id (the taxonomy file is read-only here). */
async function taxonomyIds() {
  const source = await readFile(TAXONOMY_PATH, 'utf8');
  const base = /BASE_PACK_IDS = \[([\s\S]*?)\] as const/.exec(source);
  if (!base) throw new Error('could not find BASE_PACK_IDS in the taxonomy');
  const baseIds = [...base[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  const categoryIds = [...source.matchAll(/^\s+id: '([a-z_]+)'/gm)].map((m) => m[1]);
  return new Set([...baseIds, ...categoryIds]);
}

async function main() {
  const manifest = manifestSchema.parse(JSON.parse(await readFile(MANIFEST_PATH, 'utf8')));
  const ledger = ledgerSchema.parse(JSON.parse(await readFile(LEDGER_PATH, 'utf8')));
  const ledgerById = new Map(ledger.map((row) => [row.id, row]));
  const picks = await readPicks();
  let exitCode = 0;
  const report = (ok, line) => {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${line}`);
    if (!ok) exitCode = 1;
  };

  const manifestIds = manifest.map((e) => e.id).sort();
  const expectedIds = [...new Set([...PROCEDURAL_BED_IDS, ...picks.map((p) => p.category)])].sort();
  const idsMatch = manifestIds.join(',') === expectedIds.join(',');
  report(idsMatch, `manifest ids ${manifest.length} match recipes and picks (${expectedIds.length} expected)`);
  if (!idsMatch) {
    console.log(`     manifest ${manifestIds.join(',')}`);
    console.log(`     expected ${expectedIds.join(',')}`);
  }

  const sampledNames = new Set(picks.map((p) => p.category));
  const clash = PROCEDURAL_BED_IDS.filter((id) => sampledNames.has(id));
  report(clash.length === 0, `no id is both procedural and sampled ${clash.join(',')}`);

  const known = await taxonomyIds();
  const unknown = manifest.filter((e) => !known.has(e.id)).map((e) => e.id);
  report(unknown.length === 0, `every bed id is a taxonomy or base-pack id ${unknown.join(',')}`);

  const wiringFailures = await checkAppWiring(manifest);
  report(wiringFailures.length === 0, 'src/audio/ambience-pack.ts requires every bed in the manifest');
  for (const line of wiringFailures) console.log(`     - ${line}`);

  const totalBytes = manifest.reduce((sum, e) => sum + e.bytes, 0);
  report(totalBytes < MAX_PACK_BYTES, `total ${totalBytes} bytes (limit ${MAX_PACK_BYTES})`);

  for (const entry of manifest) {
    const result = await verifyBed(entry, ledgerById.get(entry.id));
    report(result.failures.length === 0, `${entry.file} ${JSON.stringify(result.metrics)}`);
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
