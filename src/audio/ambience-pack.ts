import { z } from 'zod';

import type { AmbienceEra, BasePackId } from '@/core/analysis/ambience-taxonomy';
import { resolveBed } from '@/core/playback/resolve-bed';

const sharedManifestFields = {
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
  recipeVersion: z.string(),
};

/** A procedural base-pack row, from assets/ambience/base/manifest.json (scripts/sounds/build-base-pack.mjs). */
const proceduralEntrySchema = z.object({
  ...sharedManifestFields,
  source: z.literal('procedural'),
});

/**
 * A Freesound CC0 row, from assets/ambience/real/manifest.json (scripts/sounds/build-freesound-pack.mjs).
 * `author` and `url` are the credit and the source page, kept so the licence stays traceable.
 */
const freesoundEntrySchema = z.object({
  ...sharedManifestFields,
  source: z.literal('freesound'),
  freesoundId: z.number().int().positive(),
  author: z.string().min(1),
  url: z.string().url(),
});

export const bedManifestEntrySchema = z.discriminatedUnion('source', [
  proceduralEntrySchema,
  freesoundEntrySchema,
]);

export type BedManifestEntry = z.infer<typeof bedManifestEntrySchema>;

export interface InstalledBed {
  /** A base-pack id, or the taxonomy category id of a real (Freesound) bed. */
  readonly id: string;
  /** Bundler asset id from a static require (Metro). Passed to the audio engine as the source. */
  readonly asset: number;
  readonly meta: BedManifestEntry;
}

// Static requires so Metro bundles every bed. Record enforces that every base-pack id has a file.
// Metro types require() as any, so the asset ids are typed by the loader below.
const BASE_BED_ASSETS: Record<BasePackId, number> = {
  base_rain: require('../../assets/ambience/base/base_rain.m4a'),
  base_wind: require('../../assets/ambience/base/base_wind.m4a'),
  base_ocean: require('../../assets/ambience/base/base_ocean.m4a'),
  base_crowd: require('../../assets/ambience/base/base_crowd.m4a'),
  base_space_hum: require('../../assets/ambience/base/base_space_hum.m4a'),
  base_fire: require('../../assets/ambience/base/base_fire.m4a'),
};

/**
 * Real beds, keyed by their taxonomy category id (A3). Every key must have a row in
 * assets/ambience/real/manifest.json and a `require` in the same shape. The ambience-pack tests and
 * `npm run sounds:verify` both check that the two lists agree.
 */
const REAL_BED_ASSETS = {
  light_rain: require('../../assets/ambience/real/light_rain.m4a'),
  heavy_rain: require('../../assets/ambience/real/heavy_rain.m4a'),
  rain_on_window: require('../../assets/ambience/real/rain_on_window.m4a'),
  storm_wind: require('../../assets/ambience/real/storm_wind.m4a'),
  forest_day_birds: require('../../assets/ambience/real/forest_day_birds.m4a'),
  forest_night: require('../../assets/ambience/real/forest_night.m4a'),
  ocean_waves: require('../../assets/ambience/real/ocean_waves.m4a'),
  river_stream: require('../../assets/ambience/real/river_stream.m4a'),
  open_field_wind: require('../../assets/ambience/real/open_field_wind.m4a'),
  city_street_day: require('../../assets/ambience/real/city_street_day.m4a'),
  city_night: require('../../assets/ambience/real/city_night.m4a'),
  market_crowd: require('../../assets/ambience/real/market_crowd.m4a'),
  cafe_soft: require('../../assets/ambience/real/cafe_soft.m4a'),
  train_interior: require('../../assets/ambience/real/train_interior.m4a'),
  mountain_wind: require('../../assets/ambience/real/mountain_wind.m4a'),
  tavern_crowd: require('../../assets/ambience/real/tavern_crowd.m4a'),
  war_drums: require('../../assets/ambience/real/war_drums.m4a'),
  horse_trot: require('../../assets/ambience/real/horse_trot.m4a'),
};

const ASSET_BY_ID: ReadonlyMap<string, number> = new Map<string, number>([
  ...Object.entries(BASE_BED_ASSETS),
  ...Object.entries(REAL_BED_ASSETS),
]);

const manifestRowsSchema = z.array(z.unknown());

/**
 * Parses a bundled manifest row by row. A malformed row is a build error that verify-pack catches.
 * At runtime that one bed is skipped, the same as an uninstalled bed, so the ambience never crashes.
 */
function readManifest(raw: unknown): BedManifestEntry[] {
  const rows = manifestRowsSchema.safeParse(raw);
  if (!rows.success) return [];
  return rows.data.flatMap((row) => {
    const parsed = bedManifestEntrySchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}

function loadInstalledBeds(): ReadonlyMap<string, InstalledBed> {
  const installed = new Map<string, InstalledBed>();
  const rows = [
    ...readManifest(require('../../assets/ambience/base/manifest.json')),
    ...readManifest(require('../../assets/ambience/real/manifest.json')),
  ];
  for (const meta of rows) {
    // A manifest row without a bundled file cannot play, so it is not installed.
    const asset = ASSET_BY_ID.get(meta.id);
    if (asset === undefined) continue;
    installed.set(meta.id, { id: meta.id, asset, meta });
  }
  return installed;
}

export const INSTALLED_BEDS: ReadonlyMap<string, InstalledBed> = loadInstalledBeds();

/**
 * The bed to play for an ambience category. The category's own installed bed comes first, so a real
 * recording wins over the fallback chain (ADR-0005, A3). A bed whose era conflicts with the chapter's
 * era is never picked (A4, see resolveBed). Null skips the cue.
 */
export function resolveInstalledBed(
  categoryId: string,
  chapterEra: AmbienceEra | null = null,
): InstalledBed | null {
  const id = resolveBed(categoryId, new Set(INSTALLED_BEDS.keys()), chapterEra);
  return id === null ? null : (INSTALLED_BEDS.get(id) ?? null);
}
