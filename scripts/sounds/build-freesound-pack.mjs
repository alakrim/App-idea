#!/usr/bin/env node
// Builds the Freesound CC0 beds (A3): assets/ambience/real/<category>.m4a, real/manifest.json and the
// freesound rows of assets/ambience/LICENSES.json.
//
// Run: FREESOUND_API_KEY=$(cat ~/.config/lectio/freesound.key) npm run sounds:build-real
// Optional: -- --only=light_rain,heavy_rain to rebuild a subset (other manifest rows are kept).
//
// Per category: the chosen candidate is the top-scored one in assets/ambience/curation/<category>.json,
// unless assets/ambience/curation/overrides.json names another Freesound id. The sound's licence is
// re-checked against the API (exactly CC0). Its HQ MP3 preview is cached, decoded to mono 44.1 kHz,
// trimmed of silent or noisy edges, cut to the steadiest 63 s window, high-passed at 25 Hz and run
// through the base pack's loop recipe (scripts/sounds/loop-recipe.mjs). The key is read from the env only.

import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { z } from 'zod';

import { createFreesoundClient } from './freesound-api.mjs';
import { frameLevelsDb, steadiestWindow, usableFrameRange, FRAME_SECONDS } from './freesound-window.mjs';
import { FREESOUND_TARGETS } from './freesound-targets.mjs';
import { decodeMono, measureLoudness, runFfmpeg, sha256File } from './ffmpeg-tools.mjs';
import { checkSeam, seamPasses } from './seam.mjs';
import {
  CC0_LICENSE_URL,
  CURATION_DIR,
  FREESOUND_BUILD_SCRIPT,
  FREESOUND_RECIPE_VERSION,
  LEDGER_PATH,
  LOOP_SAMPLES,
  LUFS_TOLERANCE,
  OVERRIDES_PATH,
  PREVIEW_CACHE_DIR,
  REAL_DIR,
  REAL_MANIFEST_PATH,
  ROLL_SAMPLES,
  SAMPLE_RATE,
  TARGET_LUFS,
  TRUE_PEAK_MAX_DBTP,
} from './pack-spec.mjs';
import {
  encodeLoopAac,
  loopGraph,
  measureLoudnorm,
  rollLoop,
  WINDOW_SAMPLES,
} from './loop-recipe.mjs';

const FRAME_SAMPLES = Math.round(FRAME_SECONDS * SAMPLE_RATE);
/** Whole analysis frames that cover one loop window. */
const WINDOW_FRAMES = Math.ceil(WINDOW_SAMPLES / FRAME_SAMPLES);
const HIGH_PASS_HZ = 25;
/** Half a dB of headroom below the verify ceiling for AAC overshoot (river_stream measured -2.9 at -3). */
const ENCODE_TRUE_PEAK_DBTP = -3.5;
const FREESOUND_LEDGER_PREFIX = 'https://freesound.org/';

const curationSchema = z.object({
  category: z.string(),
  candidates: z.array(z.object({ rank: z.number().int().positive(), freesoundId: z.number().int() })),
});

const overridesSchema = z.record(
  z.string(),
  z.object({ freesoundId: z.number().int().positive(), reason: z.string().min(1) }),
);

const manifestSchema = z.array(
  z.object({
    id: z.string(),
    file: z.string(),
    durationMs: z.number().int().positive(),
    loopStartMs: z.number().nonnegative(),
    loopEndMs: z.number().positive(),
    lufs: z.number(),
    bytes: z.number().int().positive(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    kind: z.literal('bed'),
    source: z.literal('freesound'),
    recipeVersion: z.string(),
    freesoundId: z.number().int().positive(),
    author: z.string().min(1),
    url: z.string().url(),
  }),
);

const ledgerSchema = z.array(z.record(z.string(), z.string()));

async function readJsonIfExists(path, schema, fallback) {
  try {
    return schema.parse(JSON.parse(await readFile(path, 'utf8')));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

const today = () => new Date().toISOString().slice(0, 10);
const round = (value, places) => Math.round(value * 10 ** places) / 10 ** places;

/** The Freesound id to build for a category: the override when there is one, else the top candidate. */
async function chooseSoundId(target, overrides) {
  const override = overrides[target.id];
  if (override) return { freesoundId: override.freesoundId, how: `override: ${override.reason}` };
  const curation = curationSchema.parse(
    JSON.parse(await readFile(join(CURATION_DIR, `${target.id}.json`), 'utf8')),
  );
  const top = curation.candidates.find((candidate) => candidate.rank === 1);
  if (!top) throw new Error(`${target.id}: no curated candidate; run sounds:curate first`);
  return { freesoundId: top.freesoundId, how: 'top curated score' };
}

async function fetchPreview(client, sound) {
  const cached = join(PREVIEW_CACHE_DIR, `${sound.id}.mp3`);
  try {
    const info = await stat(cached);
    if (info.size > 0) return cached;
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  const bytes = await client.downloadPreview(sound.previews['preview-hq-mp3']);
  if (bytes.byteLength === 0) throw new Error(`${sound.id}: empty preview download`);
  await mkdir(PREVIEW_CACHE_DIR, { recursive: true });
  await writeFile(cached, bytes);
  return cached;
}

/** Cuts the steadiest loop-length window out of a decoded clip, or fails with the usable length. */
function cutWindow(id, samples) {
  const levels = frameLevelsDb(samples, FRAME_SAMPLES);
  const range = usableFrameRange(levels);
  const window = steadiestWindow(levels, range, WINDOW_FRAMES);
  if (window === null) {
    const usableSeconds = ((range.end - range.start) * FRAME_SAMPLES) / SAMPLE_RATE;
    throw new Error(
      `${id}: only ${round(usableSeconds, 1)} s usable after trimming; the loop needs 63.1 s. ` +
        'Choose another sound in overrides.json.',
    );
  }
  const startSample = window.startFrame * FRAME_SAMPLES;
  return {
    samples: samples.subarray(startSample, startSample + WINDOW_SAMPLES),
    startSeconds: startSample / SAMPLE_RATE,
    stdDb: window.stdDb,
  };
}

async function buildBed({ client, target, sound, how, workDir }) {
  const id = target.id;
  const preview = await fetchPreview(client, sound);
  const decoded = await decodeMono(preview);
  const cut = cutWindow(id, decoded);

  const raw = join(workDir, `${id}.window.f32`);
  const loop = join(workDir, `${id}.loop.wav`);
  const rolled = join(workDir, `${id}.rolled.wav`);
  const encoded = join(workDir, `${id}.m4a`);
  await writeFile(raw, Buffer.from(cut.samples.buffer, cut.samples.byteOffset, cut.samples.byteLength));

  await runFfmpeg([
    '-y',
    '-f',
    'f32le',
    '-ar',
    String(SAMPLE_RATE),
    '-ac',
    '1',
    '-i',
    raw,
    '-filter_complex',
    loopGraph({ startSample: 0, prefix: `highpass=f=${HIGH_PASS_HZ},` }),
    '-map',
    '[out]',
    '-c:a',
    'pcm_f32le',
    loop,
  ]);
  await rollLoop(loop, rolled);
  const measured = await measureLoudnorm(loop);
  await encodeLoopAac(rolled, measured, encoded, ENCODE_TRUE_PEAK_DBTP);

  const samples = await decodeMono(encoded);
  if (samples.length !== 2 * ROLL_SAMPLES + LOOP_SAMPLES) {
    throw new Error(`${id}: decoded ${samples.length} samples, expected ${2 * ROLL_SAMPLES + LOOP_SAMPLES}`);
  }
  const { integratedLufs, truePeakDbtp } = await measureLoudness(encoded);
  if (Math.abs(integratedLufs - TARGET_LUFS) > LUFS_TOLERANCE) {
    throw new Error(`${id}: integrated loudness ${integratedLufs} LUFS is outside the target`);
  }
  if (truePeakDbtp > TRUE_PEAK_MAX_DBTP) {
    throw new Error(`${id}: true peak ${truePeakDbtp} dBTP exceeds ${TRUE_PEAK_MAX_DBTP}`);
  }
  const seam = checkSeam(samples.subarray(ROLL_SAMPLES, ROLL_SAMPLES + LOOP_SAMPLES));
  if (!seamPasses(seam)) {
    throw new Error(
      `${id}: seam fails (dRMS ${seam.rmsDiffDb.toFixed(2)} dB, jump ${seam.jumpRatio.toFixed(2)}x); ` +
        'choose another sound in overrides.json.',
    );
  }

  const file = `${id}.m4a`;
  await copyFile(encoded, join(REAL_DIR, file));
  const { size } = await stat(join(REAL_DIR, file));
  const entry = {
    id,
    file,
    durationMs: Math.round((samples.length / SAMPLE_RATE) * 1000),
    loopStartMs: Math.round((ROLL_SAMPLES / SAMPLE_RATE) * 1e6) / 1000,
    loopEndMs: Math.round(((ROLL_SAMPLES + LOOP_SAMPLES) / SAMPLE_RATE) * 1e6) / 1000,
    lufs: round(integratedLufs, 1),
    bytes: size,
    sha256: await sha256File(join(REAL_DIR, file)),
    kind: 'bed',
    source: 'freesound',
    recipeVersion: FREESOUND_RECIPE_VERSION,
    freesoundId: sound.id,
    author: sound.username,
    url: sound.url,
  };
  return { entry, seam, how, startSeconds: round(cut.startSeconds, 1), stdDb: round(cut.stdDb, 2) };
}

/** Freesound rows are replaced on each build. Base-pack and hand-added rows are kept. */
async function updateLedger(entries) {
  const existing = await readJsonIfExists(LEDGER_PATH, ledgerSchema, []);
  const kept = existing.filter((row) => !(row.source ?? '').startsWith(FREESOUND_LEDGER_PREFIX));
  const freesound = entries.map((entry) => ({
    id: entry.id,
    file: entry.file,
    license: `CC0 1.0 Universal (${CC0_LICENSE_URL})`,
    source: entry.url,
    author: entry.author,
    date: today(),
  }));
  await writeFile(LEDGER_PATH, `${JSON.stringify([...kept, ...freesound], null, 2)}\n`);
}

function onlyFilter(args) {
  const flag = args.find((arg) => arg.startsWith('--only='));
  if (!flag) return null;
  return new Set(flag.slice('--only='.length).split(',').filter((id) => id.length > 0));
}

function assertNoDuplicateSounds(choices) {
  const seen = new Map();
  for (const choice of choices) {
    const other = seen.get(choice.freesoundId);
    if (other) {
      throw new Error(
        `${choice.id} and ${other} both use Freesound ${choice.freesoundId}; override one in overrides.json`,
      );
    }
    seen.set(choice.freesoundId, choice.id);
  }
}

async function main() {
  const client = createFreesoundClient({ apiKey: process.env.FREESOUND_API_KEY });
  const overrides = await readJsonIfExists(OVERRIDES_PATH, overridesSchema, {});
  const only = onlyFilter(process.argv.slice(2));
  const targets = FREESOUND_TARGETS.filter((target) => only === null || only.has(target.id));

  const choices = [];
  for (const target of targets) {
    const { freesoundId, how } = await chooseSoundId(target, overrides);
    choices.push({ id: target.id, freesoundId, how, target });
  }
  assertNoDuplicateSounds(choices);

  await mkdir(REAL_DIR, { recursive: true });
  const existing = await readJsonIfExists(REAL_MANIFEST_PATH, manifestSchema, []);
  const rows = new Map(existing.map((entry) => [entry.id, entry]));
  const workDir = await mkdtemp(join(tmpdir(), 'lectio-freesound-'));
  try {
    for (const choice of choices) {
      const sound = await client.sound(choice.freesoundId);
      if (sound.license !== CC0_LICENSE_URL) {
        throw new Error(`${choice.id}: Freesound ${sound.id} is "${sound.license}", not CC0; rejected`);
      }
      console.log(`building ${choice.id} from Freesound ${sound.id} (${choice.how})`);
      const { entry, seam } = await buildBed({
        client,
        target: choice.target,
        sound,
        how: choice.how,
        workDir,
      });
      rows.set(choice.id, entry);
      console.log(
        `  ${entry.file}: ${entry.durationMs} ms, ${entry.lufs} LUFS, seam dRMS ` +
          `${round(seam.rmsDiffDb, 2)} dB (limit ${round(seam.limitDb, 2)}), jump ` +
          `${round(seam.jumpRatio, 2)}x (limit ${round(seam.jumpLimit, 2)}), ${entry.bytes} bytes`,
      );
    }
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }

  const manifest = FREESOUND_TARGETS.map((target) => rows.get(target.id)).filter(
    (entry) => entry !== undefined,
  );
  await writeFile(REAL_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  await updateLedger(manifest);
  const total = manifest.reduce((sum, entry) => sum + entry.bytes, 0);
  console.log(`wrote ${manifest.length} real beds, ${total} bytes total (${FREESOUND_BUILD_SCRIPT})`);
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
