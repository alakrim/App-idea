#!/usr/bin/env node
// Builds the sampled beds named in assets/ambience/curation/picks.json (ADR-0005, brief SND1). Run: npm run sounds:build-open
//
// Per pick: the original is downloaded into a fresh work directory and its sha256 is recorded. The licence
// is checked again against the pick's page evidence. The audio is decoded to mono 44.1 kHz with a 25 Hz
// high-pass, the first and last SOURCE_EDGE_TRIM_SECONDS are dropped, and the steadiest window of loop plus
// crossfade is cut. bed-encoder.mjs then applies the same loop, roll, loudness and AAC recipe as the
// procedural beds. Writes the sampled rows of the bed manifest and the licence ledger; procedural rows are kept.

import { Buffer } from 'node:buffer';
import { copyFile, mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { encodeBed } from './bed-encoder.mjs';
import { PROCEDURAL_RECIPES } from './bed-recipes.mjs';
import { decodeMono } from './ffmpeg-tools.mjs';
import { downloadFile } from './http.mjs';
import { canonicalLicenceUrl, classifyLicence } from './licence.mjs';
import { mergeRows, readLedger, readManifest, readPicks, writeLedger, writeManifest } from './pack-manifest.mjs';
import {
  CROSSFADE_SAMPLES,
  LOOP_SAMPLES,
  PACK_DIR,
  SAMPLE_RATE,
  SOURCE_EDGE_TRIM_SECONDS,
} from './pack-spec.mjs';
import { steadiestWindowStart } from './steady-window.mjs';

/** Written to each sampled manifest row: the recipe that made it (ADR-0005, brief SND1). */
const RECIPE_VERSION_OPEN = 'open-pack-v1';
const EDGE_SAMPLES = SOURCE_EDGE_TRIM_SECONDS * SAMPLE_RATE;
const WINDOW_SAMPLES = LOOP_SAMPLES + CROSSFADE_SAMPLES;
const DOWNLOAD_DATE = new Date().toISOString().slice(0, 10);
const HIGH_PASS = 'highpass=f=25';

/** Trims the edges, then cuts the steadiest loop-plus-crossfade window as raw f32 (for encodeBed). */
function steadyWindow(samples) {
  const usable = samples.subarray(EDGE_SAMPLES, samples.length - EDGE_SAMPLES);
  const start = steadiestWindowStart(usable, WINDOW_SAMPLES, SAMPLE_RATE);
  return usable.slice(start, start + WINDOW_SAMPLES);
}

async function buildSampledBed(pick, workDir) {
  const id = pick.category;
  const licence = classifyLicence({ name: pick.licenseName, url: pick.licenseUrl });
  if (!licence.allowed) throw new Error(`${id}: ${licence.reason}`);

  const original = join(workDir, `${id}.original`);
  const { sha256: originalSha256 } = await downloadFile(pick.downloadUrl, original);
  const window = steadyWindow(await decodeMono(original, HIGH_PASS));
  const windowPath = join(workDir, `${id}.window.f32`);
  await writeFile(windowPath, Buffer.from(window.buffer, window.byteOffset, window.byteLength));

  const encoded = await encodeBed({
    id,
    workDir,
    loopSamples: LOOP_SAMPLES,
    noise: { path: windowPath, start: 0, crossfade: true },
  });
  const file = `${id}.m4a`;
  await copyFile(encoded.encodedPath, join(PACK_DIR, file));
  const { size } = await stat(join(PACK_DIR, file));
  const licenseUrl = pick.licenseUrl ?? canonicalLicenceUrl(licence.label);
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
      source: 'sampled',
      recipeVersion: RECIPE_VERSION_OPEN,
      title: pick.title,
      author: pick.author,
      sourceUrl: pick.pageUrl,
      license: licence.label,
      licenseUrl,
      originalSha256,
      downloadDate: DOWNLOAD_DATE,
    },
    ledger: {
      id,
      file,
      license: licence.label,
      /** The page the sound came from. Its licence is visible there, and the credit line names it. */
      source: pick.pageUrl,
      author: pick.author,
      date: DOWNLOAD_DATE,
      title: pick.title,
      licenseUrl,
      originalSha256,
    },
  };
}

async function main() {
  const picks = await readPicks();
  for (const pick of picks) {
    if (PROCEDURAL_RECIPES[pick.category] !== undefined) {
      throw new Error(`${pick.category} has both a procedural recipe and a sampled pick`);
    }
  }
  const workDir = await mkdtemp(join(process.env.SOUNDS_WORK_DIR ?? tmpdir(), 'lectio-sampled-beds-'));
  try {
    await mkdir(PACK_DIR, { recursive: true });
    const built = [];
    for (const pick of picks) {
      console.log(`building ${pick.category} from ${pick.pageUrl}`);
      const bed = await buildSampledBed(pick, workDir);
      console.log(`  ${bed.manifest.file}: ${bed.manifest.durationMs} ms, ${bed.manifest.lufs} LUFS, ${bed.manifest.bytes} bytes`);
      built.push(bed);
    }
    const manifest = mergeRows(
      await readManifest(),
      (row) => row.source === 'sampled',
      built.map((bed) => bed.manifest),
    );
    const ledger = mergeRows(
      await readLedger(),
      (row) => row.originalSha256 !== undefined,
      built.map((bed) => bed.ledger),
    );
    await writeManifest(manifest);
    await writeLedger(ledger);
    const total = built.reduce((sum, bed) => sum + bed.manifest.bytes, 0);
    console.log(`wrote ${built.length} sampled beds, ${total} bytes`);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
