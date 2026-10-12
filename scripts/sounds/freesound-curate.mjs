#!/usr/bin/env node
// Searches Freesound for each A3 target and writes the top five CC0 candidates, with the reasons for
// their scores, to assets/ambience/curation/<category>.json (reviewed in git).
//
// Run: FREESOUND_API_KEY=$(cat ~/.config/lectio/freesound.key) npm run sounds:curate
// Optional: -- --only=light_rain,heavy_rain to re-curate a subset.
//
// Search only: no audio is downloaded here. The key is read from FREESOUND_API_KEY and is never printed.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { createFreesoundClient } from './freesound-api.mjs';
import { rankCandidates } from './freesound-score.mjs';
import { FREESOUND_TARGETS } from './freesound-targets.mjs';
import { CC0_FILTER, CURATION_DIR } from './pack-spec.mjs';

const TOP_CANDIDATES = 5;
const PAGE_SIZE = 30;
const CURATED_ON = new Date().toISOString().slice(0, 10);

const round2 = (value) => Math.round(value * 100) / 100;

/** Runs every query of one target, merges the pages by sound id and ranks the pool. */
async function curateTarget(client, target) {
  const pool = new Map();
  for (const query of target.queries) {
    const page = await client.search({ query, filter: CC0_FILTER, pageSize: PAGE_SIZE });
    for (const sound of page.results) pool.set(sound.id, sound);
  }
  const ranked = rankCandidates([...pool.values()], target, TOP_CANDIDATES);
  return {
    category: target.id,
    rank: target.rank,
    curatedOn: CURATED_ON,
    queries: target.queries,
    poolSize: pool.size,
    candidates: ranked.map((entry, index) => ({
      rank: index + 1,
      freesoundId: entry.sound.id,
      name: entry.sound.name,
      url: entry.sound.url,
      author: entry.sound.username,
      license: entry.sound.license,
      durationSec: round2(entry.sound.duration),
      samplerate: entry.sound.samplerate,
      channels: entry.sound.channels,
      avgRating: round2(entry.sound.avg_rating),
      numRatings: entry.sound.num_ratings,
      numDownloads: entry.sound.num_downloads,
      previewUrl: entry.sound.previews['preview-hq-mp3'],
      score: entry.score,
      reasons: entry.reasons,
    })),
  };
}

function onlyFilter(args) {
  const flag = args.find((arg) => arg.startsWith('--only='));
  if (!flag) return null;
  return new Set(flag.slice('--only='.length).split(',').filter((id) => id.length > 0));
}

async function main() {
  const client = createFreesoundClient({ apiKey: process.env.FREESOUND_API_KEY });
  const only = onlyFilter(process.argv.slice(2));
  const targets = FREESOUND_TARGETS.filter((target) => only === null || only.has(target.id));
  await mkdir(CURATION_DIR, { recursive: true });

  let exitCode = 0;
  for (const target of targets) {
    const record = await curateTarget(client, target);
    await writeFile(join(CURATION_DIR, `${target.id}.json`), `${JSON.stringify(record, null, 2)}\n`);
    const top = record.candidates[0];
    if (top === undefined) {
      exitCode = 1;
      console.log(`${target.id.padEnd(18)} NO CC0 CANDIDATES (pool ${record.poolSize})`);
    } else {
      console.log(
        `${target.id.padEnd(18)} top ${top.freesoundId} score ${top.score} ${top.durationSec}s ` +
          `pool ${record.poolSize}: ${top.name}`,
      );
    }
  }
  process.exitCode = exitCode;
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
