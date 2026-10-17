// Schemas and read/merge/write for the two pack records: the bed manifest and the licence ledger.
// Procedural and sampled builds each rewrite only the rows they own, so both can run in any order.

import { readFile, writeFile } from 'node:fs/promises';

import { z } from 'zod';

import { LEDGER_PATH, MANIFEST_PATH, PICKS_PATH } from './pack-spec.mjs';

const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const baseRow = z.object({
  id: z.string().min(1),
  file: z.string().min(1),
  durationMs: z.number().int().positive(),
  /** Loop region [loopStartMs, loopEndMs). The file carries roll audio outside it; never play the rolls. */
  loopStartMs: z.number().nonnegative(),
  loopEndMs: z.number().positive(),
  lufs: z.number(),
  bytes: z.number().int().positive(),
  sha256,
  kind: z.literal('bed'),
  recipeVersion: z.string().min(1),
});

const proceduralRow = baseRow.extend({ source: z.literal('procedural') });

const sampledRow = baseRow.extend({
  source: z.literal('sampled'),
  title: z.string().min(1),
  author: z.string().min(1),
  /** The page the sound was downloaded from; its licence is visible there. */
  sourceUrl: z.url(),
  license: z.string().min(1),
  licenseUrl: z.string().min(1),
  originalSha256: sha256,
  downloadDate: isoDate,
});

export const manifestSchema = z.array(z.discriminatedUnion('source', [proceduralRow, sampledRow]));

export const ledgerSchema = z.array(
  z.object({
    id: z.string().min(1),
    file: z.string().min(1),
    license: z.string().min(1),
    source: z.string().min(1),
    author: z.string().min(1),
    date: isoDate,
    title: z.string().min(1).optional(),
    licenseUrl: z.string().min(1).optional(),
    originalSha256: sha256.optional(),
  }),
);

/** One reviewed sampled candidate per category (assets/ambience/curation/picks.json). */
export const pickSchema = z.object({
  category: z.string().min(1),
  source: z.enum(['commons', 'archive.org', 'opengameart']),
  title: z.string().min(1),
  author: z.string().min(1),
  pageUrl: z.url(),
  downloadUrl: z.url(),
  licenseName: z.string().nullable(),
  licenseUrl: z.string().nullable(),
  reason: z.string().min(1),
});

export const picksSchema = z.array(pickSchema);

export async function readRecords(path, schema) {
  return schema.parse(JSON.parse(await readFile(path, 'utf8')));
}

export async function readManifest() {
  return readRecords(MANIFEST_PATH, manifestSchema);
}

export async function readLedger() {
  try {
    return ledgerSchema.parse(JSON.parse(await readFile(LEDGER_PATH, 'utf8')));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

export async function readPicks() {
  return readRecords(PICKS_PATH, picksSchema);
}

/** Keeps rows this builder does not own, adds the fresh rows, and sorts by id for stable diffs. */
export function mergeRows(existing, owned, fresh) {
  const kept = existing.filter((row) => !owned(row));
  return [...kept, ...fresh].sort((a, b) => a.id.localeCompare(b.id));
}

export async function writeManifest(rows) {
  await writeFile(MANIFEST_PATH, `${JSON.stringify(rows, null, 2)}\n`);
}

export async function writeLedger(rows) {
  await writeFile(LEDGER_PATH, `${JSON.stringify(rows, null, 2)}\n`);
}
