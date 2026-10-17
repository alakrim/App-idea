/**
 * Every ambience bed installed in assets/ambience/beds (brief SND1): procedural and sampled, base-pack ids
 * and taxonomy category ids. A category with its own bed resolves to itself; any other category falls back
 * through the taxonomy (src/core/analysis/ambience-taxonomy.ts).
 *
 * This file holds the ids only, with no `require`, so the id rules run under Node tests. ambience-pack.ts
 * maps each id to its bundled file with a Record, so a missing or extra id fails the typecheck.
 */
export const INSTALLED_BED_IDS = [
  // Base pack: procedural fallbacks for the families that have no bed of their own.
  'base_rain',
  'base_wind',
  'base_ocean',
  'base_crowd',
  'base_space_hum',
  'base_fire',
  // Procedural category beds.
  'airplane_cabin',
  'blizzard_wind',
  'castle_hall',
  'city_night',
  'city_street_day',
  'clock_ticking',
  'cafe_soft',
  'battle_field',
  'crowd_murmur',
  'fireplace_crackle',
  'forest_night',
  'heavy_rain',
  'horse_trot',
  'library_quiet',
  'light_rain',
  'market_crowd',
  'mountain_wind',
  'office_hum',
  'ominous_drone',
  'qi_hum',
  'rain_on_window',
  'river_stream',
  'ship_deck',
  'snowfall_quiet',
  'spaceship_engine',
  'spirit_whispers',
  'starship_bridge',
  'storm_wind',
  'tavern_crowd',
  'tense_heartbeat',
  'train_interior',
  // Sampled beds (CC0, Public Domain or CC BY, credited in assets/ambience/LICENSES.json).
  'forest_day_birds',
  'jungle_insects',
  'ocean_waves',
] as const;

export type InstalledBedId = (typeof INSTALLED_BED_IDS)[number];

export function isInstalledBedId(value: string): value is InstalledBedId {
  return (INSTALLED_BED_IDS as readonly string[]).includes(value);
}
