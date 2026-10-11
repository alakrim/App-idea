/**
 * The ambience taxonomy (R4 section 2, ADR-0005). Ids are stable snake_case and are never renamed
 * once shipped: they are stored in cues and resolved against sound packs at playback time.
 *
 * Fallbacks: a bed names the next id to try when no sound is installed for it. The chain always
 * ends in a procedural base-pack id, or in `null` to skip the cue. Oneshots have no fallback in v1.
 */

export type AmbienceKind = 'bed' | 'oneshot';

/** Kinds the analysis may emit in v1. One-shots are reserved for v1.1 (ADR-0005). */
export const ENABLED_KINDS = ['bed'] as const satisfies readonly AmbienceKind[];

/**
 * Procedural base-pack ids, synthesized at build time and always installed. They are named with a
 * `base_` prefix so they cannot collide with category ids (R4 names `crowd_murmur` as both).
 */
export const BASE_PACK_IDS = [
  'base_rain',
  'base_wind',
  'base_ocean',
  'base_crowd',
  'base_space_hum',
  'base_fire',
] as const;

export type BasePackId = (typeof BASE_PACK_IDS)[number];

export interface AmbienceCategoryDef {
  readonly id: string;
  readonly family: string;
  readonly kind: AmbienceKind;
  readonly description: string;
  /** Next id to try when this category has no installed sound. `null` skips the cue. */
  readonly fallback: string | null;
}

export const AMBIENCE_CATEGORIES = [
  // nature
  {
    id: 'forest_day_birds',
    family: 'nature',
    kind: 'bed',
    description: 'Daytime forest with birdsong, light leaf rustle, distant woodpecker.',
    fallback: 'open_field_wind',
  },
  {
    id: 'forest_night',
    family: 'nature',
    kind: 'bed',
    description: 'Night forest: crickets, an occasional owl, soft wind in trees.',
    fallback: 'open_field_wind',
  },
  {
    id: 'open_field_wind',
    family: 'nature',
    kind: 'bed',
    description: 'Open grassland or moor, steady wind through grass, no birds.',
    fallback: 'base_wind',
  },
  {
    id: 'mountain_wind',
    family: 'nature',
    kind: 'bed',
    description: 'High exposed mountain wind with cold gusts and sparse echo.',
    fallback: 'open_field_wind',
  },
  {
    id: 'ocean_waves',
    family: 'nature',
    kind: 'bed',
    description: 'Surf on a beach, rhythmic waves with a slow swell.',
    fallback: 'base_ocean',
  },
  {
    id: 'river_stream',
    family: 'nature',
    kind: 'bed',
    description: 'Flowing stream or river over stones.',
    fallback: 'base_rain',
  },
  {
    id: 'jungle_insects',
    family: 'nature',
    kind: 'bed',
    description: 'Tropical jungle: insects, distant monkeys, dripping foliage.',
    fallback: 'forest_day_birds',
  },
  // weather
  {
    id: 'light_rain',
    family: 'weather',
    kind: 'bed',
    description: 'Gentle steady rain on leaves or ground.',
    fallback: 'base_rain',
  },
  {
    id: 'heavy_rain',
    family: 'weather',
    kind: 'bed',
    description: 'Downpour, dense steady rain.',
    fallback: 'light_rain',
  },
  {
    id: 'storm_wind',
    family: 'weather',
    kind: 'bed',
    description: 'Storm: strong gusts, rain, distant rolling thunder.',
    fallback: 'heavy_rain',
  },
  {
    id: 'snowfall_quiet',
    family: 'weather',
    kind: 'bed',
    description: 'Muffled quiet of falling snow.',
    fallback: 'open_field_wind',
  },
  {
    id: 'blizzard_wind',
    family: 'weather',
    kind: 'bed',
    description: 'Howling snow wind, harsh and cold.',
    fallback: 'mountain_wind',
  },
  {
    id: 'thunder_clap',
    family: 'weather',
    kind: 'oneshot',
    description: 'Single close thunder crack.',
    fallback: null,
  },
  // urban
  {
    id: 'city_street_day',
    family: 'urban',
    kind: 'bed',
    description: 'Busy city street by day: traffic, footsteps, distant voices.',
    fallback: 'crowd_murmur',
  },
  {
    id: 'city_night',
    family: 'urban',
    kind: 'bed',
    description: 'Night city: light traffic, distant sirens, humming signs.',
    fallback: 'city_street_day',
  },
  {
    id: 'market_crowd',
    family: 'urban',
    kind: 'bed',
    description: 'Open market or bazaar: vendors calling, many voices.',
    fallback: 'crowd_murmur',
  },
  {
    id: 'village_square',
    family: 'urban',
    kind: 'bed',
    description: 'Small village square, few voices, a cart, a dog barking.',
    fallback: 'crowd_murmur',
  },
  {
    id: 'harbor_port',
    family: 'urban',
    kind: 'bed',
    description: 'Port: gulls, ropes, distant cranes, water against hulls.',
    fallback: 'ocean_waves',
  },
  {
    id: 'crowd_murmur',
    family: 'urban',
    kind: 'bed',
    description: 'Large crowd murmuring; no distinct words.',
    fallback: 'base_crowd',
  },
  // interiors
  {
    id: 'tavern_crowd',
    family: 'interiors',
    kind: 'bed',
    description: 'Busy tavern: many conversations, clinking mugs, distant laughter.',
    fallback: 'crowd_murmur',
  },
  {
    id: 'castle_hall',
    family: 'interiors',
    kind: 'bed',
    description: 'Large stone hall with faint echo and distant footsteps.',
    fallback: 'library_quiet',
  },
  {
    id: 'fireplace_crackle',
    family: 'interiors',
    kind: 'bed',
    description: 'Crackling fire in a room, soft pops.',
    fallback: 'base_fire',
  },
  {
    id: 'kitchen_busy',
    family: 'interiors',
    kind: 'bed',
    description: 'Kitchen at work: pots, chopping, sizzling, voices.',
    fallback: 'tavern_crowd',
  },
  {
    id: 'office_hum',
    family: 'interiors',
    kind: 'bed',
    description: 'Modern office: HVAC hum, keyboards, faint phones.',
    fallback: 'base_space_hum',
  },
  {
    id: 'library_quiet',
    family: 'interiors',
    kind: 'bed',
    description: 'Library: near silence, page turns, soft room tone.',
    fallback: 'base_space_hum',
  },
  {
    id: 'hospital_ward',
    family: 'interiors',
    kind: 'bed',
    description: 'Hospital ward: distant monitors, carts, low voices.',
    fallback: 'office_hum',
  },
  {
    id: 'prison_cell',
    family: 'interiors',
    kind: 'bed',
    description: 'Stone cell with dripping water and distant metal echoes.',
    fallback: 'base_rain',
  },
  {
    id: 'cafe_soft',
    family: 'interiors',
    kind: 'bed',
    description: 'Quiet cafe, soft chatter, cups clinking.',
    fallback: 'tavern_crowd',
  },
  {
    id: 'lecture_hall',
    family: 'interiors',
    kind: 'bed',
    description: 'Lecture hall: quiet audience rustle, distant HVAC.',
    fallback: 'library_quiet',
  },
  {
    id: 'door_slam',
    family: 'interiors',
    kind: 'oneshot',
    description: 'Single heavy door slam.',
    fallback: null,
  },
  // transport
  {
    id: 'horse_trot',
    family: 'transport',
    kind: 'bed',
    description: 'Horse walking or trotting on a dirt road, hooves, light tack creak.',
    fallback: 'open_field_wind',
  },
  {
    id: 'horse_gallop',
    family: 'transport',
    kind: 'bed',
    description: 'Fast gallop, pounding hooves, breath and leather.',
    fallback: 'horse_trot',
  },
  {
    id: 'carriage_wheels',
    family: 'transport',
    kind: 'bed',
    description: 'Wooden carriage on road, wheels creaking, harness jingle.',
    fallback: 'horse_trot',
  },
  {
    id: 'ship_deck',
    family: 'transport',
    kind: 'bed',
    description: 'Wooden sailing ship at sea: ropes, creaking hull, sails.',
    fallback: 'ocean_waves',
  },
  {
    id: 'train_interior',
    family: 'transport',
    kind: 'bed',
    description: 'Train carriage: rhythmic wheels on rail, muffled cabin.',
    fallback: 'airplane_cabin',
  },
  {
    id: 'airplane_cabin',
    family: 'transport',
    kind: 'bed',
    description: 'Airplane cabin: steady engine drone, muffled air.',
    fallback: 'base_space_hum',
  },
  // combat
  {
    id: 'battle_field',
    family: 'combat',
    kind: 'bed',
    description: 'Distant battlefield: shouts, clashing metal, horns.',
    fallback: 'crowd_murmur',
  },
  {
    id: 'war_drums',
    family: 'combat',
    kind: 'bed',
    description: 'Drums and horns of an approaching army, tense.',
    fallback: 'battle_field',
  },
  {
    id: 'gunfight_ambient',
    family: 'combat',
    kind: 'bed',
    description: 'Distant gunfire with echoes and shouting.',
    fallback: 'battle_field',
  },
  {
    id: 'arena_crowd',
    family: 'combat',
    kind: 'bed',
    description: 'Stadium or arena crowd cheering or jeering.',
    fallback: 'crowd_murmur',
  },
  {
    id: 'sword_clash',
    family: 'combat',
    kind: 'oneshot',
    description: 'Single steel-on-steel clash.',
    fallback: null,
  },
  {
    id: 'gunshot',
    family: 'combat',
    kind: 'oneshot',
    description: 'Single gunshot.',
    fallback: null,
  },
  {
    id: 'explosion_distant',
    family: 'combat',
    kind: 'oneshot',
    description: 'Distant boom with rumble.',
    fallback: null,
  },
  // mystical
  {
    id: 'ritual_chant',
    family: 'mystical',
    kind: 'bed',
    description: 'Low chanted voices in a ritual, reverberant.',
    fallback: 'crowd_murmur',
  },
  {
    id: 'temple_incense',
    family: 'mystical',
    kind: 'bed',
    description: 'Temple interior: soft bells, hushed chanting.',
    fallback: 'ritual_chant',
  },
  {
    id: 'qi_hum',
    family: 'mystical',
    kind: 'bed',
    description: 'Cultivation aura: low resonant hum, soft wind, faint shimmer.',
    fallback: 'base_space_hum',
  },
  {
    id: 'spirit_whispers',
    family: 'mystical',
    kind: 'bed',
    description: 'Faint ghostly whispers, eerie air.',
    fallback: null,
  },
  {
    id: 'magic_shimmer',
    family: 'mystical',
    kind: 'oneshot',
    description: 'Spell cast with a rising shimmer.',
    fallback: null,
  },
  {
    id: 'bell_toll',
    family: 'mystical',
    kind: 'oneshot',
    description: 'Single temple or church bell toll.',
    fallback: null,
  },
  // sci-fi
  {
    id: 'starship_bridge',
    family: 'sci-fi',
    kind: 'bed',
    description: 'Spaceship bridge: low electronic hum, faint console tones.',
    fallback: 'base_space_hum',
  },
  {
    id: 'spaceship_engine',
    family: 'sci-fi',
    kind: 'bed',
    description: 'Deep engine rumble in a spaceship corridor.',
    fallback: 'starship_bridge',
  },
  {
    id: 'alien_atmosphere',
    family: 'sci-fi',
    kind: 'bed',
    description: 'Alien planet: strange wind, unfamiliar chirps, low drone.',
    fallback: 'open_field_wind',
  },
  {
    id: 'space_station',
    family: 'sci-fi',
    kind: 'bed',
    description: 'Space station: steady air handling, distant clanks.',
    fallback: 'starship_bridge',
  },
  {
    id: 'laser_blast',
    family: 'sci-fi',
    kind: 'oneshot',
    description: 'Single laser zap.',
    fallback: null,
  },
  // mood
  {
    id: 'tense_heartbeat',
    family: 'mood',
    kind: 'bed',
    description:
      'Muffled heartbeat under silence, for suspense. Requires explicit tension in text.',
    fallback: null,
  },
  {
    id: 'clock_ticking',
    family: 'mood',
    kind: 'bed',
    description: 'Slow ticking clock, tension.',
    fallback: null,
  },
  {
    id: 'ominous_drone',
    family: 'mood',
    kind: 'bed',
    description: 'Low dark drone, horror atmosphere.',
    fallback: 'base_space_hum',
  },
  {
    id: 'ballroom_party',
    family: 'mood',
    kind: 'bed',
    description: 'Ballroom or party murmur: glasses, distant chatter. No music.',
    fallback: 'crowd_murmur',
  },
  {
    id: 'rain_on_window',
    family: 'mood',
    kind: 'bed',
    description: 'Rain against window glass heard from a warm room; intimate scenes.',
    fallback: 'light_rain',
  },
] as const satisfies readonly AmbienceCategoryDef[];

export type AmbienceCategory = (typeof AMBIENCE_CATEGORIES)[number];
export type AmbienceCategoryId = AmbienceCategory['id'];

/** Tuple form of every category id, for building zod enums. */
export const AMBIENCE_CATEGORY_IDS = AMBIENCE_CATEGORIES.map((c) => c.id) as [
  AmbienceCategoryId,
  ...AmbienceCategoryId[],
];

const CATEGORY_BY_ID: ReadonlyMap<string, AmbienceCategory> = new Map(
  AMBIENCE_CATEGORIES.map((c) => [c.id, c]),
);

export function getCategory(id: string): AmbienceCategory | undefined {
  return CATEGORY_BY_ID.get(id);
}

export function isBasePackId(value: string): value is BasePackId {
  return (BASE_PACK_IDS as readonly string[]).includes(value);
}

export function isEnabledKind(kind: AmbienceKind): boolean {
  return (ENABLED_KINDS as readonly AmbienceKind[]).includes(kind);
}

/** Categories the analysis may emit in v1, in taxonomy order. */
export function enabledCategories(): AmbienceCategory[] {
  return AMBIENCE_CATEGORIES.filter((c) => isEnabledKind(c.kind));
}

/**
 * Ids to try after `id`, in order, ending with a base-pack id. Empty when `id` is skipped (its
 * fallback is `null`). Throws on an unknown id, an unknown fallback target or a cycle.
 */
export function fallbackChain(id: string): string[] {
  const start = CATEGORY_BY_ID.get(id);
  if (!start) throw new Error(`unknown ambience category: ${id}`);
  const chain: string[] = [];
  const seen = new Set<string>([id]);
  let next = start.fallback;
  while (next !== null) {
    if (seen.has(next)) throw new Error(`fallback cycle at ${next}`);
    seen.add(next);
    chain.push(next);
    if (isBasePackId(next)) return chain;
    const def = CATEGORY_BY_ID.get(next);
    if (!def) throw new Error(`unknown fallback target: ${next}`);
    next = def.fallback;
  }
  return chain;
}
