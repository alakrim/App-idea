#!/usr/bin/env node
// A4 content screening. For each bed target, screens the top curated Freesound candidates:
//   1. AudioSet tags for every one-second frame (screen/tag.py, PANNs CNN14), cached under .cache/;
//   2. the level of every second (ffmpeg, mono 44.1 kHz);
//   3. the policy (screen-policy.mjs): denied families, required sounds, the cleanest 64 s window;
//   4. the passing candidates re-ranked by CLAP text-audio similarity (screen/clap.py).
// The verdict and its evidence go into assets/ambience/curation/<category>.json under `screening`. The
// build (build-freesound-pack.mjs) only cuts a candidate whose screening passed. No key is used here.
//
// Run: npm run sounds:screen
// Optional: -- --only=light_rain,heavy_rain   -- --no-clap (rank by curation order only)

import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { z } from 'zod';

import { frameLevelsDb } from './freesound-window.mjs';
import { FREESOUND_TARGETS } from './freesound-targets.mjs';
import { decodeMono } from './ffmpeg-tools.mjs';
import {
  chooseCandidate,
  DENY_FRAME_PROBABILITY,
  familiesFor,
  labelsFor,
  parseAudiosetNames,
  policyFor,
  REQUIRED_FRACTION,
  REQUIRED_FRAME_PROBABILITY,
  screenCandidate,
  WINDOW_FRAMES,
} from './screen-policy.mjs';
import {
  AUDIOSET_CSV_PATH,
  CLAP_MODEL,
  CURATION_DIR,
  PREVIEW_CACHE_DIR,
  SCREEN_CANDIDATES,
  SCREEN_CLAP_SCRIPT,
  SCREEN_HF_HOME,
  SCREEN_HOME,
  SCREEN_PYTHON,
  SCREEN_TAG_SCRIPT,
  SCREEN_WORK_DIR,
} from './pack-spec.mjs';

const execFileAsync = promisify(execFile);
const MODEL_SAMPLE_RATE = 32000;
const LEVEL_SAMPLE_RATE = 44100;
const MAX_BUFFER = 64 * 1024 * 1024;

const curationSchema = z
  .object({
    category: z.string(),
    candidates: z.array(
      z.object({
        rank: z.number().int().positive(),
        freesoundId: z.number().int().positive(),
        name: z.string(),
        url: z.string(),
        author: z.string(),
        durationSec: z.number().positive(),
        previewUrl: z.string().url(),
      }),
    ),
  })
  .passthrough();

const tagsSchema = z.object({
  frameSeconds: z.literal(1),
  frames: z.number().int().nonnegative(),
  labels: z.array(z.string()),
  perFrame: z.array(z.array(z.number())),
  topClasses: z.array(z.object({ label: z.string(), max: z.number() })),
});

/** The environment the Python steps run in: no key, and a fake HOME so nothing lands in the real one. */
function pythonEnv() {
  return {
    PATH: process.env.PATH ?? '/usr/bin:/bin',
    HOME: SCREEN_HOME,
    HF_HOME: SCREEN_HF_HOME,
    LANG: 'C.UTF-8',
    FFMPEG_PATH: process.env.FFMPEG_PATH ?? 'ffmpeg',
  };
}

async function runPython(args) {
  const { stdout } = await execFileAsync(SCREEN_PYTHON, ['-I', ...args], {
    env: pythonEnv(),
    maxBuffer: MAX_BUFFER,
  });
  return stdout;
}

async function fileExists(path) {
  try {
    return (await stat(path)).size > 0;
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

/** The preview is the candidate's HQ MP3 (A3). Cached; downloaded without the key, once per retry. */
async function ensurePreview(candidate) {
  const path = join(PREVIEW_CACHE_DIR, `${candidate.freesoundId}.mp3`);
  if (await fileExists(path)) return path;
  await mkdir(PREVIEW_CACHE_DIR, { recursive: true });
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(candidate.previewUrl);
    if (response.ok) {
      await writeFile(path, Buffer.from(await response.arrayBuffer()));
      return path;
    }
    lastError = new Error(`preview download HTTP ${response.status}`);
  }
  throw lastError;
}

/** AudioSet tags per second for one preview. Cached per Freesound id; re-tagged when a label is missing. */
async function tagsFor(candidate, preview, labels) {
  const cachePath = join(SCREEN_WORK_DIR, 'tags', `${candidate.freesoundId}.json`);
  if (await fileExists(cachePath)) {
    const cached = tagsSchema.parse(await readJson(cachePath));
    if (labels.every((label) => cached.labels.includes(label))) return cached;
  }
  const pcm = await decodeMono(preview, MODEL_SAMPLE_RATE);
  const raw = join(SCREEN_WORK_DIR, `${candidate.freesoundId}.32k.f32`);
  await writeFile(raw, Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength));
  const labelsPath = join(SCREEN_WORK_DIR, 'labels.json');
  await writeFile(labelsPath, JSON.stringify(labels));
  const outPath = join(SCREEN_WORK_DIR, `${candidate.freesoundId}.tags.tmp.json`);
  try {
    await runPython([SCREEN_TAG_SCRIPT, raw, labelsPath, outPath]);
    const tags = tagsSchema.parse(await readJson(outPath));
    await mkdir(join(SCREEN_WORK_DIR, 'tags'), { recursive: true });
    await writeFile(cachePath, JSON.stringify(tags));
    return tags;
  } finally {
    await rm(raw, { force: true });
    await rm(outPath, { force: true });
  }
}

/** The dB level of every whole second of the clip (the same time base as the tags). */
async function levelsOf(preview) {
  const pcm = await decodeMono(preview, LEVEL_SAMPLE_RATE);
  return frameLevelsDb(pcm, LEVEL_SAMPLE_RATE);
}

function summarizeRejects(candidates) {
  const reasons = [...new Set(candidates.filter((c) => c.verdict === 'reject').map((c) => c.reason))];
  return reasons.slice(0, 2).join('; ');
}

/** Screens every candidate of one target. Returns one record per candidate, in curation order. */
async function screenTarget(target, curation, names, unionLabels) {
  const policy = policyFor(target, names);
  const candidates = [];
  for (const entry of curation.candidates.slice(0, SCREEN_CANDIDATES)) {
    const base = {
      rank: entry.rank,
      freesoundId: entry.freesoundId,
      name: entry.name,
      url: entry.url,
      author: entry.author,
      durationSec: Math.round(entry.durationSec * 10) / 10,
    };
    try {
      const preview = await ensurePreview(entry);
      const tags = await tagsFor(entry, preview, unionLabels);
      const result = screenCandidate({ tags, levelsDb: await levelsOf(preview), policy });
      candidates.push({ ...base, ...result, preview, clapScore: null });
    } catch (err) {
      candidates.push({
        ...base,
        verdict: 'reject',
        reason: `could not be screened: ${err.message.split('\n')[0]}`,
        window: null,
        evidence: null,
        preview: null,
        clapScore: null,
      });
    }
  }
  return { target, policy, candidates };
}

function screeningRecord({ target, policy, candidates, clapModel, screenedOn }) {
  const chosen = chooseCandidate(candidates);
  const verdict = chosen ? 'filled' : 'unfilled';
  const unfilledReason =
    chosen || candidates.length === 0
      ? null
      : summarizeRejects(candidates) || 'no candidate passed the screen';
  return {
    screenedOn,
    tagger: 'PANNs CNN14 (Cnn14_mAP=0.431), AudioSet 527 classes, 1 s frames',
    reranker: clapModel,
    thresholds: {
      denyFrameProbability: DENY_FRAME_PROBABILITY,
      requiredFrameProbability: REQUIRED_FRAME_PROBABILITY,
      requiredFraction: REQUIRED_FRACTION,
      windowSeconds: WINDOW_FRAMES,
    },
    policy: {
      families: familiesFor(target),
      exempt: target.screen.exempt,
      required: policy.required,
      clapPrompt: policy.clap,
    },
    verdict,
    unfilledReason,
    chosen: chosen
      ? {
          freesoundId: chosen.freesoundId,
          windowStartSeconds: chosen.window.startSeconds,
          windowSeconds: chosen.window.lengthSeconds,
          steadinessDb: chosen.window.steadinessDb,
          clapScore: chosen.clapScore,
        }
      : null,
    candidates: candidates.map((c) => ({
      rank: c.rank,
      freesoundId: c.freesoundId,
      name: c.name,
      url: c.url,
      author: c.author,
      durationSec: c.durationSec,
      verdict: c.verdict,
      reason: c.reason ?? null,
      window: c.window ?? null,
      clapScore: c.clapScore,
      evidence: c.evidence ?? null,
    })),
  };
}

function onlyFilter(args) {
  const flag = args.find((arg) => arg.startsWith('--only='));
  if (!flag) return null;
  return new Set(flag.slice('--only='.length).split(',').filter((id) => id.length > 0));
}

async function main() {
  const args = process.argv.slice(2);
  const useClap = !args.includes('--no-clap');
  const only = onlyFilter(args);
  const targets = FREESOUND_TARGETS.filter((target) => only === null || only.has(target.id));
  const names = parseAudiosetNames(await readFile(AUDIOSET_CSV_PATH, 'utf8'));
  const unionLabels = [...new Set(FREESOUND_TARGETS.flatMap((t) => labelsFor(policyFor(t, names))))];
  const screenedOn = new Date().toISOString().slice(0, 10);
  await mkdir(SCREEN_WORK_DIR, { recursive: true });

  const screened = [];
  for (const target of targets) {
    const curation = curationSchema.parse(await readJson(join(CURATION_DIR, `${target.id}.json`)));
    console.log(`screening ${target.id} (${Math.min(curation.candidates.length, SCREEN_CANDIDATES)} candidates)`);
    screened.push(await screenTarget(target, curation, names, unionLabels));
  }

  const clapScores = {};
  if (useClap) {
    const requests = screened.flatMap(({ target, candidates }) =>
      candidates
        .filter((c) => c.verdict === 'pass')
        .map((c) => ({
          id: `${target.id}:${c.freesoundId}`,
          audio: c.preview,
          startSeconds: c.window.startSeconds,
          lengthSeconds: c.window.lengthSeconds,
          prompt: target.screen.clap,
        })),
    );
    if (requests.length > 0) {
      const requestsPath = join(SCREEN_WORK_DIR, 'clap-requests.json');
      const outPath = join(SCREEN_WORK_DIR, 'clap-scores.json');
      await writeFile(requestsPath, JSON.stringify(requests));
      await runPython([SCREEN_CLAP_SCRIPT, requestsPath, outPath]);
      Object.assign(clapScores, z.object({ scores: z.record(z.string(), z.number()) }).parse(await readJson(outPath)).scores);
    }
  }

  for (const { target, policy, candidates } of screened) {
    for (const c of candidates) {
      c.clapScore = clapScores[`${target.id}:${c.freesoundId}`] ?? null;
    }
    const record = screeningRecord({
      target,
      policy,
      candidates,
      clapModel: useClap ? CLAP_MODEL : null,
      screenedOn,
    });
    const path = join(CURATION_DIR, `${target.id}.json`);
    const curation = await readJson(path);
    await writeFile(path, `${JSON.stringify({ ...curation, screening: record }, null, 2)}\n`);
    const chosen = record.chosen
      ? `${record.chosen.freesoundId} at ${record.chosen.windowStartSeconds} s (CLAP ${record.chosen.clapScore ?? 'n/a'})`
      : `UNFILLED: ${record.unfilledReason}`;
    console.log(`${target.id.padEnd(18)} ${chosen}`);
  }
  const filled = screened.filter(({ target }) => targets.includes(target)).length;
  console.log(`screened ${filled} categories; screening written to ${CURATION_DIR}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
