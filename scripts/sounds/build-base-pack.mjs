#!/usr/bin/env node
// Synthesizes the procedural ambience beds (ADR-0005, R4 sections 5 and 6, brief SND1). Run: npm run sounds:build
//
// Per bed: the recipe in bed-recipes.mjs is rendered to 75 s of raw float audio with ffmpeg generators and
// filters (every random source is seeded). bed-encoder.mjs then makes the seamless 60 s loop, the periodic
// tonal stem, the roll, the two-pass loudnorm to -28 LUFS and the AAC-LC mono 64 kbps .m4a.
//
// Determinism: anoisesrc is seeded with `s=`, and aevalsrc's random(n) is deterministic across runs.
// Rebuilds with the same ffmpeg build are byte-stable.
// Writes the procedural rows of assets/ambience/beds/manifest.json and of assets/ambience/LICENSES.json,
// and leaves the sampled rows (written by build-open-pack.mjs) untouched.

import { copyFile, mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { encodeBed } from './bed-encoder.mjs';
import { PROCEDURAL_RECIPES, RECIPE_VERSION, noiseGraph } from './bed-recipes.mjs';
import { runFfmpeg } from './ffmpeg-tools.mjs';
import {
  BUILD_SCRIPT,
  EDGE_TRIM_SECONDS,
  LOOP_SAMPLES,
  PACK_DIR,
  SAMPLE_RATE,
} from './pack-spec.mjs';
import { mergeRows, readLedger, readManifest, writeLedger, writeManifest } from './pack-manifest.mjs';

/** The date the procedural rows were generated for their licence record. */
const PROCEDURAL_LEDGER_DATE = '2026-10-17';
const EDGE_SAMPLES = EDGE_TRIM_SECONDS * SAMPLE_RATE;

async function renderSynthesis(id, noiseFragments, workDir) {
  const path = join(workDir, `${id}.synth.f32`);
  await runFfmpeg([
    '-y',
    '-filter_complex',
    noiseGraph(noiseFragments).join(';'),
    '-map',
    '[out]',
    '-ac',
    '1',
    '-ar',
    String(SAMPLE_RATE),
    '-f',
    'f32le',
    path,
  ]);
  return path;
}

async function buildProceduralBed(id, workDir) {
  const recipe = PROCEDURAL_RECIPES[id];
  const noise = recipe.noise
    ? { path: await renderSynthesis(id, recipe.noise, workDir), start: EDGE_SAMPLES, crossfade: true }
    : undefined;
  const encoded = await encodeBed({
    id,
    workDir,
    loopSamples: LOOP_SAMPLES,
    noise,
    tonal: recipe.tonal,
  });
  const file = `${id}.m4a`;
  await copyFile(encoded.encodedPath, join(PACK_DIR, file));
  const { size } = await stat(join(PACK_DIR, file));
  return {
    manifest: {
      id,
      file,
      durationMs: encoded.durationMs,
      loopStartMs: encoded.loopStartMs,
      loopEndMs: encoded.loopEndMs,
      lufs: encoded.lufs,
      bytes: size,
      sha256: encoded.sha256,
      kind: 'bed',
      source: 'procedural',
      recipeVersion: RECIPE_VERSION,
    },
    ledger: {
      id,
      file,
      license: 'Proprietary (generated in-house)',
      source: BUILD_SCRIPT,
      author: 'Lectio',
      date: PROCEDURAL_LEDGER_DATE,
    },
  };
}

async function main() {
  const workDir = await mkdtemp(join(process.env.SOUNDS_WORK_DIR ?? tmpdir(), 'lectio-procedural-beds-'));
  try {
    await mkdir(PACK_DIR, { recursive: true });
    const built = [];
    for (const id of Object.keys(PROCEDURAL_RECIPES)) {
      console.log(`building ${id}`);
      const bed = await buildProceduralBed(id, workDir);
      console.log(`  ${bed.manifest.file}: ${bed.manifest.durationMs} ms, ${bed.manifest.lufs} LUFS, ${bed.manifest.bytes} bytes`);
      built.push(bed);
    }
    const manifest = mergeRows(
      await readManifest(),
      (row) => row.source === 'procedural',
      built.map((bed) => bed.manifest),
    );
    const ledger = mergeRows(
      await readLedger(),
      (row) => row.source === BUILD_SCRIPT,
      built.map((bed) => bed.ledger),
    );
    await writeManifest(manifest);
    await writeLedger(ledger);
    const total = built.reduce((sum, bed) => sum + bed.manifest.bytes, 0);
    console.log(`wrote ${built.length} procedural beds, ${total} bytes`);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
