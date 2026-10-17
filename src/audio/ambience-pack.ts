import { z } from 'zod';

import { resolveBed } from '@/core/playback/resolve-bed';

import { isInstalledBedId } from './installed-beds';

import type { InstalledBedId } from './installed-beds';

/** One row of assets/ambience/beds/manifest.json (written by scripts/sounds/build-*.mjs). */
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
  readonly id: InstalledBedId;
  /** Bundler asset id from a static require (Metro). Passed to the audio engine as the source. */
  readonly asset: number;
  readonly meta: BedManifestEntry;
}

// Static requires so Metro bundles every bed. The Record fails the typecheck when an id in
// installed-beds.ts has no file here, or a file is required under an id that is not installed.
// verify-pack.mjs checks that each require names the file the manifest lists.
const BED_ASSETS: Record<InstalledBedId, number> = {
  base_rain: require('../../assets/ambience/beds/base_rain.m4a'),
  base_wind: require('../../assets/ambience/beds/base_wind.m4a'),
  base_ocean: require('../../assets/ambience/beds/base_ocean.m4a'),
  base_crowd: require('../../assets/ambience/beds/base_crowd.m4a'),
  base_space_hum: require('../../assets/ambience/beds/base_space_hum.m4a'),
  base_fire: require('../../assets/ambience/beds/base_fire.m4a'),
  airplane_cabin: require('../../assets/ambience/beds/airplane_cabin.m4a'),
  blizzard_wind: require('../../assets/ambience/beds/blizzard_wind.m4a'),
  castle_hall: require('../../assets/ambience/beds/castle_hall.m4a'),
  city_night: require('../../assets/ambience/beds/city_night.m4a'),
  city_street_day: require('../../assets/ambience/beds/city_street_day.m4a'),
  clock_ticking: require('../../assets/ambience/beds/clock_ticking.m4a'),
  cafe_soft: require('../../assets/ambience/beds/cafe_soft.m4a'),
  battle_field: require('../../assets/ambience/beds/battle_field.m4a'),
  crowd_murmur: require('../../assets/ambience/beds/crowd_murmur.m4a'),
  fireplace_crackle: require('../../assets/ambience/beds/fireplace_crackle.m4a'),
  forest_night: require('../../assets/ambience/beds/forest_night.m4a'),
  heavy_rain: require('../../assets/ambience/beds/heavy_rain.m4a'),
  horse_trot: require('../../assets/ambience/beds/horse_trot.m4a'),
  library_quiet: require('../../assets/ambience/beds/library_quiet.m4a'),
  light_rain: require('../../assets/ambience/beds/light_rain.m4a'),
  market_crowd: require('../../assets/ambience/beds/market_crowd.m4a'),
  mountain_wind: require('../../assets/ambience/beds/mountain_wind.m4a'),
  office_hum: require('../../assets/ambience/beds/office_hum.m4a'),
  ominous_drone: require('../../assets/ambience/beds/ominous_drone.m4a'),
  qi_hum: require('../../assets/ambience/beds/qi_hum.m4a'),
  rain_on_window: require('../../assets/ambience/beds/rain_on_window.m4a'),
  river_stream: require('../../assets/ambience/beds/river_stream.m4a'),
  ship_deck: require('../../assets/ambience/beds/ship_deck.m4a'),
  snowfall_quiet: require('../../assets/ambience/beds/snowfall_quiet.m4a'),
  spaceship_engine: require('../../assets/ambience/beds/spaceship_engine.m4a'),
  spirit_whispers: require('../../assets/ambience/beds/spirit_whispers.m4a'),
  starship_bridge: require('../../assets/ambience/beds/starship_bridge.m4a'),
  storm_wind: require('../../assets/ambience/beds/storm_wind.m4a'),
  tavern_crowd: require('../../assets/ambience/beds/tavern_crowd.m4a'),
  tense_heartbeat: require('../../assets/ambience/beds/tense_heartbeat.m4a'),
  train_interior: require('../../assets/ambience/beds/train_interior.m4a'),
  forest_day_birds: require('../../assets/ambience/beds/forest_day_birds.m4a'),
  jungle_insects: require('../../assets/ambience/beds/jungle_insects.m4a'),
  ocean_waves: require('../../assets/ambience/beds/ocean_waves.m4a'),
};

function loadInstalledBeds(): ReadonlyMap<InstalledBedId, InstalledBed> {
  const parsed = bedManifestEntrySchema
    .array()
    .safeParse(require('../../assets/ambience/beds/manifest.json'));
  const installed = new Map<InstalledBedId, InstalledBed>();
  // A malformed bundled manifest is a build error that verify-pack catches. At runtime the ambience
  // is skipped rather than crashing the app, the same as an uninstalled bed.
  if (!parsed.success) return installed;
  for (const meta of parsed.data) {
    if (!isInstalledBedId(meta.id)) continue;
    installed.set(meta.id, { id: meta.id, asset: BED_ASSETS[meta.id], meta });
  }
  return installed;
}

export const INSTALLED_BEDS: ReadonlyMap<InstalledBedId, InstalledBed> = loadInstalledBeds();

/** The bed to play for an ambience category, falling back through the taxonomy. Null skips the cue. */
export function resolveInstalledBed(categoryId: string): InstalledBed | null {
  const id = resolveBed(categoryId, new Set(INSTALLED_BEDS.keys()));
  if (id === null || !isInstalledBedId(id)) return null;
  return INSTALLED_BEDS.get(id) ?? null;
}
