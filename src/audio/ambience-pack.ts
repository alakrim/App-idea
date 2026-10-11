import { z } from 'zod';

import { isBasePackId } from '@/core/analysis/ambience-taxonomy';
import type { BasePackId } from '@/core/analysis/ambience-taxonomy';
import { resolveBed } from '@/core/playback/resolve-bed';

/** One row of assets/ambience/base/manifest.json (written by scripts/sounds/build-base-pack.mjs). */
export const bedManifestEntrySchema = z.object({
  id: z.string(),
  file: z.string(),
  durationMs: z.number().int().positive(),
  /** Loop region [loopStartMs, loopEndMs). The file carries roll audio outside it; never play the rolls. */
  loopStartMs: z.number().nonnegative(),
  loopEndMs: z.number().positive(),
  lufs: z.number(),
  bytes: z.number().int().positive(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  kind: z.literal('bed'),
  source: z.enum(['procedural', 'sampled']),
  recipeVersion: z.string(),
});

export type BedManifestEntry = z.infer<typeof bedManifestEntrySchema>;

export interface InstalledBed {
  readonly id: BasePackId;
  /** Bundler asset id from a static require (Metro). Passed to the audio engine as the source. */
  readonly asset: number;
  readonly meta: BedManifestEntry;
}

// Static requires so Metro bundles every bed. Each key is a base-pack id; Record enforces coverage.
// Metro types require() as any, so the asset ids are typed by the loader below.
const BED_ASSETS: Record<BasePackId, number> = {
  base_rain: require('../../assets/ambience/base/base_rain.m4a'),
  base_wind: require('../../assets/ambience/base/base_wind.m4a'),
  base_ocean: require('../../assets/ambience/base/base_ocean.m4a'),
  base_crowd: require('../../assets/ambience/base/base_crowd.m4a'),
  base_space_hum: require('../../assets/ambience/base/base_space_hum.m4a'),
  base_fire: require('../../assets/ambience/base/base_fire.m4a'),
};

function loadInstalledBeds(): ReadonlyMap<BasePackId, InstalledBed> {
  const parsed = bedManifestEntrySchema
    .array()
    .safeParse(require('../../assets/ambience/base/manifest.json'));
  const installed = new Map<BasePackId, InstalledBed>();
  // A malformed bundled manifest is a build error that verify-pack catches. At runtime the ambience
  // is skipped rather than crashing the app, the same as an uninstalled bed.
  if (!parsed.success) return installed;
  for (const meta of parsed.data) {
    if (!isBasePackId(meta.id)) continue;
    installed.set(meta.id, { id: meta.id, asset: BED_ASSETS[meta.id], meta });
  }
  return installed;
}

export const INSTALLED_BEDS: ReadonlyMap<BasePackId, InstalledBed> = loadInstalledBeds();

/** The bed to play for an ambience category, falling back through the taxonomy. Null skips the cue. */
export function resolveInstalledBed(categoryId: string): InstalledBed | null {
  const id = resolveBed(categoryId, new Set(INSTALLED_BEDS.keys()));
  if (id === null || !isBasePackId(id)) return null;
  return INSTALLED_BEDS.get(id) ?? null;
}
