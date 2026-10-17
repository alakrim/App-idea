#!/usr/bin/env node
// Searches the open sources for every sampled target and writes assets/ambience/curation/<category>.json:
// the top candidates with their licence evidence, the score and the reasons, plus a count of rejections
// by reason. The files are committed so the choice can be reviewed in git. Run: npm run sounds:curate
// Optional arguments: category ids, to curate only those targets.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { CURATION_TARGETS } from './curation-targets.mjs';
import { scoreCandidate, screenCandidate } from './curation-score.mjs';
import {
  ARCHIVE_LICENCE_FILTERS,
  inspectArchiveItem,
  searchArchive,
  searchCommons,
} from './curation-sources.mjs';
import { CURATION_DIR } from './pack-spec.mjs';

const TOP_CANDIDATES = 8;
/** archive.org items cost one metadata request each, so only the best-matching screened items are read. */
const MAX_ARCHIVE_INSPECTIONS = 12;
const CURATION_DATE = new Date().toISOString().slice(0, 10);

const count = (tally, reason) => {
  tally[reason] = (tally[reason] ?? 0) + 1;
};

async function gatherCandidates(queries) {
  const seen = new Map();
  const add = (candidates) => {
    for (const candidate of candidates) {
      if (!seen.has(candidate.pageUrl)) seen.set(candidate.pageUrl, candidate);
    }
  };
  for (const query of queries) {
    for (const filter of ARCHIVE_LICENCE_FILTERS) add(await searchArchive(query, filter));
    add(await searchCommons(query));
  }
  return [...seen.values()];
}

async function curateTarget(target) {
  const rejected = {};
  const screened = [];
  for (const candidate of await gatherCandidates(target.queries)) {
    const screen = screenCandidate(candidate, target);
    if (!screen.allowed) {
      count(rejected, screen.reason);
      continue;
    }
    screened.push({ candidate, hits: screen.hits.length, licence: screen.licence });
  }
  screened.sort((a, b) => b.hits - a.hits);
  const inspectable = new Set(
    screened.filter((s) => s.candidate.source === 'archive.org').slice(0, MAX_ARCHIVE_INSPECTIONS),
  );

  const scored = [];
  for (const entry of screened) {
    const { candidate, licence } = entry;
    let durationS = candidate.durationS;
    let downloadUrl = candidate.downloadUrl;
    let format = null;
    if (candidate.source === 'archive.org') {
      if (!inspectable.has(entry)) continue;
      const inspected = await inspectArchiveItem(candidate.identifier);
      if (!inspected) {
        count(rejected, 'no preferred audio file with a readable duration');
        continue;
      }
      ({ durationS, downloadUrl, format } = inspected);
    }
    const verdict = scoreCandidate(candidate, target, durationS);
    if (!verdict.allowed) {
      count(rejected, verdict.reason);
      continue;
    }
    scored.push({ candidate, verdict, licence, durationS, downloadUrl, format });
  }
  scored.sort((a, b) => b.verdict.score - a.verdict.score);

  return {
    category: target.category,
    curatedOn: CURATION_DATE,
    queries: target.queries,
    candidates: scored.slice(0, TOP_CANDIDATES).map(({ candidate, verdict, licence, durationS, downloadUrl, format }) => ({
      source: candidate.source,
      title: candidate.title,
      author: candidate.author,
      pageUrl: candidate.pageUrl,
      downloadUrl,
      format,
      durationS: Math.round(durationS * 10) / 10,
      licenseName: candidate.licenseName,
      licenseUrl: candidate.licenseUrl,
      licenseLabel: licence.label,
      licenseKind: licence.kind,
      score: verdict.score,
      reasons: verdict.reasons,
    })),
    rejected,
  };
}

async function main() {
  const only = new Set(process.argv.slice(2));
  const targets = CURATION_TARGETS.filter((t) => only.size === 0 || only.has(t.category));
  await mkdir(CURATION_DIR, { recursive: true });
  for (const target of targets) {
    console.log(`curating ${target.category}`);
    const result = await curateTarget(target);
    await writeFile(join(CURATION_DIR, `${target.category}.json`), `${JSON.stringify(result, null, 2)}\n`);
    console.log(`  ${result.candidates.length} candidates, top: ${result.candidates[0]?.title ?? 'none'}`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
