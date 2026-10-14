/**
 * The ambience taxonomy (R4 section 2, ADR-0005, A4 v2). Ids are stable snake_case and are never
 * renamed once shipped: they are stored in cues and resolved against sound packs at playback time.
 *
 * Fallbacks: a bed names the next id to try when no sound is installed for it. The chain always
 * ends in a procedural base-pack id, or in `null` to skip the cue. Oneshots have no fallback in v1.
 *
 * Eras (A4): every category is single-purpose and has an era. A chapter has the same era (or none),
 * and a bed is only played in a chapter whose era accepts it (see `bedFitsEra`).
 */

export type AmbienceKind = 'bed' | 'oneshot';

/** Kinds the analysis may emit in v1. One-shots are reserved for v1.1 (ADR-0005). */
export const ENABLED_KINDS = ['bed'] as const satisfies readonly AmbienceKind[];

/**
 * When a sound belongs to. `timeless`: nature, weather, fire, water, wind, caves and quiet interiors
 * with no technology. `historic`: pre-industrial human scenes. `modern`: the post-industrial world
 * (traffic, trains, offices, hospitals, aircraft). `futuristic`: science fiction.
 */
export const AMBIENCE_ERAS = ['timeless', 'historic', 'modern', 'futuristic'] as const;
export type AmbienceEra = (typeof AMBIENCE_ERAS)[number];

/**
 * The beds a chapter of each era accepts. A timeless chapter takes only timeless beds. A historic
 * chapter takes no modern or futuristic bed, and a modern chapter takes no futuristic one.
 */
const ERA_ACCEPTS: Readonly<Record<AmbienceEra, readonly AmbienceEra[]>> = {
  timeless: ['timeless'],
  historic: ['timeless', 'historic'],
  modern: ['timeless', 'historic', 'modern'],
  futuristic: ['timeless', 'modern', 'futuristic'],
};

/** True when a bed of `bedEra` may play in a chapter of `chapterEra`. An unknown chapter era (null) accepts any bed. */
export function bedFitsEra(bedEra: AmbienceEra, chapterEra: AmbienceEra | null): boolean {
  return chapterEra === null || ERA_ACCEPTS[chapterEra].includes(bedEra);
}

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

/**
 * The era of each base-pack bed. The hum is a synthesized drone with no identifiable source, so it
 * is timeless. The procedural crowd is a historic human murmur.
 */
export const BASE_PACK_ERA: Readonly<Record<BasePackId, AmbienceEra>> = {
  base_rain: 'timeless',
  base_wind: 'timeless',
  base_ocean: 'timeless',
  base_crowd: 'historic',
  base_space_hum: 'timeless',
  base_fire: 'timeless',
};

/** Lucide icon names the taxonomy uses. The player maps each one to its component. */
export const AMBIENCE_ICON_NAMES = [
  'Anchor',
  'Anvil',
  'Atom',
  'Bell',
  'Bird',
  'Bomb',
  'Briefcase',
  'Bug',
  'Building',
  'Building2',
  'Castle',
  'Church',
  'Clock',
  'CloudDrizzle',
  'CloudLightning',
  'CloudRain',
  'CloudSnow',
  'Coffee',
  'Cog',
  'Crosshair',
  'DoorClosed',
  'Droplet',
  'Droplets',
  'Drum',
  'Flame',
  'Footprints',
  'Ghost',
  'HeartPulse',
  'Hospital',
  'Landmark',
  'Library',
  'Lock',
  'Moon',
  'Mountain',
  'Music',
  'Plane',
  'Rocket',
  'Route',
  'Satellite',
  'School',
  'Ship',
  'Skull',
  'Snowflake',
  'Sparkle',
  'Sparkles',
  'Store',
  'Sword',
  'Swords',
  'Target',
  'Telescope',
  'TrainFront',
  'Trophy',
  'Users',
  'Utensils',
  'WandSparkles',
  'Waves',
  'Waypoints',
  'Wind',
  'Wine',
  'Zap',
] as const;
export type AmbienceIconName = (typeof AMBIENCE_ICON_NAMES)[number];

export interface AmbienceCategoryDef {
  readonly id: string;
  /** English display name, Title Case, at most 18 characters. */
  readonly label: string;
  /** Lucide icon name for the category. */
  readonly icon: AmbienceIconName;
  readonly family: string;
  readonly kind: AmbienceKind;
  readonly era: AmbienceEra;
  /** One line: the only sounds the bed should hold. Written for the analysis prompt. */
  readonly contains: string;
  /** Sounds the bed must never hold. Written for the analysis prompt and the screening policy. */
  readonly mustNotContain: readonly string[];
  /** Next id to try when this category has no installed sound. `null` skips the cue. */
  readonly fallback: string | null;
}

export const AMBIENCE_CATEGORIES = [
  // nature (timeless)
  {
    id: 'forest_day_birds',
    label: 'Forest by Day',
    icon: 'Bird',
    family: 'nature',
    kind: 'bed',
    era: 'timeless',
    contains: 'Daytime forest: birdsong, light leaf rustle, a distant woodpecker.',
    mustNotContain: ['people', 'engines', 'thunder', 'sirens'],
    fallback: 'open_field_wind',
  },
  {
    id: 'forest_night',
    label: 'Forest at Night',
    icon: 'Moon',
    family: 'nature',
    kind: 'bed',
    era: 'timeless',
    contains: 'Night forest: crickets, an occasional owl, soft wind in the trees.',
    mustNotContain: ['people', 'engines', 'thunder', 'sirens'],
    fallback: 'open_field_wind',
  },
  {
    id: 'open_field_wind',
    label: 'Open Field',
    icon: 'Wind',
    family: 'nature',
    kind: 'bed',
    era: 'timeless',
    contains: 'Open grassland or moor: steady wind through grass.',
    mustNotContain: ['birds', 'people', 'engines', 'thunder'],
    fallback: 'base_wind',
  },
  {
    id: 'mountain_wind',
    label: 'Mountain Wind',
    icon: 'Mountain',
    family: 'nature',
    kind: 'bed',
    era: 'timeless',
    contains: 'High exposed mountain wind: cold gusts and a sparse echo.',
    mustNotContain: ['people', 'engines', 'thunder', 'birds'],
    fallback: 'open_field_wind',
  },
  {
    id: 'ocean_waves',
    label: 'Ocean Waves',
    icon: 'Waves',
    family: 'nature',
    kind: 'bed',
    era: 'timeless',
    contains: 'Surf on a beach: rhythmic waves and a slow swell.',
    mustNotContain: ['people', 'engines', 'sirens', 'thunder'],
    fallback: 'base_ocean',
  },
  {
    id: 'river_stream',
    label: 'River Stream',
    icon: 'Droplets',
    family: 'nature',
    kind: 'bed',
    era: 'timeless',
    contains: 'A stream or river running over stones.',
    mustNotContain: ['people', 'engines', 'thunder'],
    fallback: 'base_rain',
  },
  {
    id: 'jungle_insects',
    label: 'Jungle',
    icon: 'Bug',
    family: 'nature',
    kind: 'bed',
    era: 'timeless',
    contains: 'Tropical jungle: insects, distant monkeys, dripping foliage.',
    mustNotContain: ['people', 'engines', 'thunder'],
    fallback: 'forest_day_birds',
  },
  {
    id: 'waterfall',
    label: 'Waterfall',
    icon: 'Droplets',
    family: 'nature',
    kind: 'bed',
    era: 'timeless',
    contains: 'A waterfall roaring into a pool.',
    mustNotContain: ['people', 'engines', 'thunder'],
    fallback: 'river_stream',
  },
  {
    id: 'lake_shore',
    label: 'Lake Shore',
    icon: 'Waves',
    family: 'nature',
    kind: 'bed',
    era: 'timeless',
    contains: 'A calm lake shore: gentle lapping water and reeds.',
    mustNotContain: ['people', 'engines', 'sirens', 'thunder'],
    fallback: 'river_stream',
  },
  {
    id: 'desert_wind',
    label: 'Desert',
    icon: 'Wind',
    family: 'nature',
    kind: 'bed',
    era: 'timeless',
    contains: 'An empty desert: wind hissing over sand.',
    mustNotContain: ['birds', 'people', 'engines', 'thunder'],
    fallback: 'open_field_wind',
  },
  {
    id: 'wind_in_trees',
    label: 'Forest Wind',
    icon: 'Wind',
    family: 'nature',
    kind: 'bed',
    era: 'timeless',
    contains: 'Wind moving through a tall forest canopy, branches creaking.',
    mustNotContain: ['birds', 'people', 'engines', 'thunder'],
    fallback: 'open_field_wind',
  },
  {
    id: 'cave_drip',
    label: 'Cave',
    icon: 'Droplet',
    family: 'nature',
    kind: 'bed',
    era: 'timeless',
    contains: 'Inside a cave: slow water drips, a faint echo, still air.',
    mustNotContain: ['wind gusts', 'people', 'engines', 'thunder', 'music'],
    fallback: 'base_rain',
  },
  {
    id: 'meadow_insects',
    label: 'Summer Meadow',
    icon: 'Bug',
    family: 'nature',
    kind: 'bed',
    era: 'timeless',
    contains: 'A summer meadow at dusk: crickets and grasshoppers, a light breeze.',
    mustNotContain: ['birds', 'people', 'engines', 'thunder'],
    fallback: 'open_field_wind',
  },
  {
    id: 'seabird_cliffs',
    label: 'Sea Cliffs',
    icon: 'Bird',
    family: 'nature',
    kind: 'bed',
    era: 'timeless',
    contains: 'Sea cliffs: seabirds calling over the surf.',
    mustNotContain: ['people', 'engines', 'sirens', 'speech'],
    fallback: 'ocean_waves',
  },
  {
    id: 'sea_storm',
    label: 'Sea Storm',
    icon: 'Anchor',
    family: 'nature',
    kind: 'bed',
    era: 'timeless',
    contains: 'A rough sea in strong wind: heavy waves breaking, spray, no thunder.',
    mustNotContain: ['thunder', 'people', 'engines', 'sirens'],
    fallback: 'ocean_waves',
  },
  {
    id: 'campfire_night',
    label: 'Campfire',
    icon: 'Flame',
    family: 'nature',
    kind: 'bed',
    era: 'timeless',
    contains: 'A campfire at night: crackling wood, soft wind, a far-off owl.',
    mustNotContain: ['people', 'engines', 'thunder', 'sirens'],
    fallback: 'fireplace_crackle',
  },
  // weather (timeless)
  {
    id: 'light_rain',
    label: 'Light Rain',
    icon: 'CloudDrizzle',
    family: 'weather',
    kind: 'bed',
    era: 'timeless',
    contains: 'Gentle steady rain on leaves or ground.',
    mustNotContain: ['thunder', 'wind gusts', 'people', 'engines'],
    fallback: 'base_rain',
  },
  {
    id: 'heavy_rain',
    label: 'Heavy Rain',
    icon: 'CloudRain',
    family: 'weather',
    kind: 'bed',
    era: 'timeless',
    contains: 'A downpour: dense, steady rain.',
    mustNotContain: ['thunder', 'people', 'engines', 'sirens'],
    fallback: 'light_rain',
  },
  {
    id: 'rain_on_roof',
    label: 'Rain on Roof',
    icon: 'CloudRain',
    family: 'weather',
    kind: 'bed',
    era: 'timeless',
    contains: 'Rain drumming on a roof, heard from inside a building.',
    mustNotContain: ['thunder', 'people', 'traffic', 'engines'],
    fallback: 'light_rain',
  },
  {
    id: 'thunderstorm',
    label: 'Thunderstorm',
    icon: 'Zap',
    family: 'weather',
    kind: 'bed',
    era: 'timeless',
    contains: 'Rain with distant rolling thunder, and nothing else.',
    mustNotContain: ['people', 'engines', 'sirens', 'music'],
    fallback: 'heavy_rain',
  },
  {
    id: 'storm_wind',
    label: 'Storm Wind',
    icon: 'CloudLightning',
    family: 'weather',
    kind: 'bed',
    era: 'timeless',
    contains: 'Gusting storm wind through trees or open land.',
    mustNotContain: ['thunder', 'sirens', 'people', 'engines', 'music'],
    fallback: 'heavy_rain',
  },
  {
    id: 'snowfall_quiet',
    label: 'Quiet Snowfall',
    icon: 'CloudSnow',
    family: 'weather',
    kind: 'bed',
    era: 'timeless',
    contains: 'The muffled quiet of falling snow.',
    mustNotContain: ['wind gusts', 'people', 'engines', 'thunder'],
    fallback: 'open_field_wind',
  },
  {
    id: 'blizzard_wind',
    label: 'Blizzard',
    icon: 'Snowflake',
    family: 'weather',
    kind: 'bed',
    era: 'timeless',
    contains: 'Howling snow wind: harsh and cold.',
    mustNotContain: ['people', 'engines', 'thunder', 'sirens'],
    fallback: 'mountain_wind',
  },
  {
    id: 'thunder_clap',
    label: 'Thunder Clap',
    icon: 'Zap',
    family: 'weather',
    kind: 'oneshot',
    era: 'timeless',
    contains: 'A single close thunder crack.',
    mustNotContain: ['people', 'engines'],
    fallback: null,
  },
  // urban (modern unless noted)
  {
    id: 'city_street_day',
    label: 'City Street',
    icon: 'Building2',
    family: 'urban',
    kind: 'bed',
    era: 'modern',
    contains: 'A busy city street by day: traffic, footsteps, distant voices.',
    mustNotContain: ['sirens', 'alarms', 'music'],
    fallback: 'crowd_murmur',
  },
  {
    id: 'city_night',
    label: 'City at Night',
    icon: 'Building',
    family: 'urban',
    kind: 'bed',
    era: 'modern',
    contains: 'A city at night: light traffic and a humming sign.',
    mustNotContain: ['sirens', 'alarms', 'music', 'speech'],
    fallback: 'city_street_day',
  },
  {
    id: 'market_crowd',
    label: 'Market',
    icon: 'Store',
    family: 'urban',
    kind: 'bed',
    era: 'historic',
    contains: 'An open-air market without engines: vendors calling, many voices.',
    mustNotContain: ['engines', 'traffic', 'sirens', 'music', 'radio'],
    fallback: 'crowd_murmur',
  },
  {
    id: 'village_square',
    label: 'Village Square',
    icon: 'Landmark',
    family: 'urban',
    kind: 'bed',
    era: 'historic',
    contains: 'A small village square: a few voices, a cart, a dog barking.',
    mustNotContain: ['engines', 'traffic', 'sirens', 'music', 'radio'],
    fallback: 'crowd_murmur',
  },
  {
    id: 'harbor_port',
    label: 'Harbor',
    icon: 'Anchor',
    family: 'urban',
    kind: 'bed',
    era: 'historic',
    contains: 'An old harbour: gulls, ropes, water against wooden hulls.',
    mustNotContain: ['engines', 'cranes', 'sirens', 'music', 'traffic'],
    fallback: 'ocean_waves',
  },
  {
    id: 'crowd_murmur',
    label: 'Crowd',
    icon: 'Users',
    family: 'urban',
    kind: 'bed',
    era: 'historic',
    contains: 'A large crowd murmuring, with no distinct words.',
    mustNotContain: ['traffic', 'engines', 'sirens', 'music', 'phones'],
    fallback: 'base_crowd',
  },
  // interiors
  {
    id: 'tavern_crowd',
    label: 'Tavern',
    icon: 'Wine',
    family: 'interiors',
    kind: 'bed',
    era: 'historic',
    contains: 'A busy tavern: many conversations, clinking mugs, a distant laugh.',
    mustNotContain: ['music', 'instruments', 'traffic', 'engines', 'sirens'],
    fallback: 'crowd_murmur',
  },
  {
    id: 'castle_hall',
    label: 'Castle Hall',
    icon: 'Castle',
    family: 'interiors',
    kind: 'bed',
    era: 'historic',
    contains: 'A large stone hall: a faint echo and distant footsteps.',
    mustNotContain: ['music', 'engines', 'sirens', 'crowd', 'speech'],
    fallback: 'library_quiet',
  },
  {
    id: 'fireplace_crackle',
    label: 'Fireplace',
    icon: 'Flame',
    family: 'interiors',
    kind: 'bed',
    era: 'timeless',
    contains: 'A crackling fire in a room, soft pops.',
    mustNotContain: ['people', 'engines', 'thunder'],
    fallback: 'base_fire',
  },
  {
    id: 'kitchen_busy',
    label: 'Kitchen',
    icon: 'Utensils',
    family: 'interiors',
    kind: 'bed',
    era: 'historic',
    contains: 'A kitchen at work: pots, chopping, sizzling.',
    mustNotContain: ['music', 'engines', 'sirens', 'radio'],
    fallback: 'tavern_crowd',
  },
  {
    id: 'office_hum',
    label: 'Office',
    icon: 'Briefcase',
    family: 'interiors',
    kind: 'bed',
    era: 'modern',
    contains: 'A modern office: HVAC hum, keyboards, a faint phone.',
    mustNotContain: ['sirens', 'music', 'speech', 'traffic'],
    fallback: 'base_space_hum',
  },
  {
    id: 'library_quiet',
    label: 'Library',
    icon: 'Library',
    family: 'interiors',
    kind: 'bed',
    era: 'timeless',
    contains: 'A library: near silence, a page turned now and then, soft room tone.',
    mustNotContain: ['music', 'engines', 'sirens', 'crowd', 'speech'],
    fallback: 'base_space_hum',
  },
  {
    id: 'hospital_ward',
    label: 'Hospital Ward',
    icon: 'Hospital',
    family: 'interiors',
    kind: 'bed',
    era: 'modern',
    contains: 'A hospital ward: distant monitors, carts, a low voice.',
    mustNotContain: ['sirens', 'music', 'shouting'],
    fallback: 'office_hum',
  },
  {
    id: 'prison_cell',
    label: 'Prison Cell',
    icon: 'Lock',
    family: 'interiors',
    kind: 'bed',
    era: 'historic',
    contains: 'A stone cell with dripping water and distant echoes of metal.',
    mustNotContain: ['engines', 'sirens', 'radio', 'music', 'speech'],
    fallback: 'base_rain',
  },
  {
    id: 'cafe_soft',
    label: 'Quiet Cafe',
    icon: 'Coffee',
    family: 'interiors',
    kind: 'bed',
    era: 'modern',
    contains: 'A quiet cafe: soft chatter and cups clinking.',
    mustNotContain: ['music', 'sirens', 'traffic'],
    fallback: 'tavern_crowd',
  },
  {
    id: 'lecture_hall',
    label: 'Lecture Hall',
    icon: 'School',
    family: 'interiors',
    kind: 'bed',
    era: 'modern',
    contains: 'A lecture hall: a quiet audience rustle and distant ventilation.',
    mustNotContain: ['music', 'sirens', 'shouting', 'speech'],
    fallback: 'library_quiet',
  },
  {
    id: 'door_slam',
    label: 'Door Slam',
    icon: 'DoorClosed',
    family: 'interiors',
    kind: 'oneshot',
    era: 'timeless',
    contains: 'A single heavy door slam.',
    mustNotContain: ['music', 'speech'],
    fallback: null,
  },
  {
    id: 'forge_anvil',
    label: 'Forge',
    icon: 'Anvil',
    family: 'interiors',
    kind: 'bed',
    era: 'historic',
    contains: "A blacksmith's forge: hammer on anvil, bellows, a crackling fire.",
    mustNotContain: ['engines', 'power tools', 'sirens', 'music', 'radio'],
    fallback: 'fireplace_crackle',
  },
  // transport
  {
    id: 'horse_trot',
    label: 'Horse Trot',
    icon: 'Footprints',
    family: 'transport',
    kind: 'bed',
    era: 'historic',
    contains: 'A horse trotting on a dirt road: hooves, a light tack creak.',
    mustNotContain: ['cars', 'engines', 'traffic', 'sirens', 'speech'],
    fallback: 'open_field_wind',
  },
  {
    id: 'horse_gallop',
    label: 'Horse Gallop',
    icon: 'Route',
    family: 'transport',
    kind: 'bed',
    era: 'historic',
    contains: 'A horse galloping: pounding hooves, breath and leather.',
    mustNotContain: ['cars', 'engines', 'traffic', 'sirens', 'speech'],
    fallback: 'horse_trot',
  },
  {
    id: 'carriage_wheels',
    label: 'Carriage',
    icon: 'Waypoints',
    family: 'transport',
    kind: 'bed',
    era: 'historic',
    contains: 'A wooden carriage on a road: wheels creaking, harness jingle.',
    mustNotContain: ['cars', 'engines', 'traffic', 'sirens', 'music'],
    fallback: 'horse_trot',
  },
  {
    id: 'ship_deck',
    label: 'Ship Deck',
    icon: 'Ship',
    family: 'transport',
    kind: 'bed',
    era: 'historic',
    contains: 'A wooden sailing ship at sea: ropes, a creaking hull, flapping sails.',
    mustNotContain: ['engines', 'sirens', 'music', 'speech'],
    fallback: 'ocean_waves',
  },
  {
    id: 'train_interior',
    label: 'Train',
    icon: 'TrainFront',
    family: 'transport',
    kind: 'bed',
    era: 'modern',
    contains: 'A train carriage: rhythmic wheels on rail, a muffled cabin.',
    mustNotContain: ['sirens', 'music', 'announcements', 'shouting'],
    fallback: 'airplane_cabin',
  },
  {
    id: 'airplane_cabin',
    label: 'Airplane',
    icon: 'Plane',
    family: 'transport',
    kind: 'bed',
    era: 'modern',
    contains: 'An airplane cabin: a steady engine drone and muffled air.',
    mustNotContain: ['sirens', 'music', 'announcements', 'shouting'],
    fallback: 'base_space_hum',
  },
  {
    id: 'subway_platform',
    label: 'Subway',
    icon: 'TrainFront',
    family: 'transport',
    kind: 'bed',
    era: 'modern',
    contains: 'An underground platform: a train far off and an echoing hall.',
    mustNotContain: ['music', 'sirens', 'announcements'],
    fallback: 'train_interior',
  },
  // combat
  {
    id: 'battle_field',
    label: 'Battlefield',
    icon: 'Swords',
    family: 'combat',
    kind: 'bed',
    era: 'historic',
    contains: 'A distant battle: shouts, clashing metal, horns.',
    mustNotContain: ['gunfire', 'engines', 'sirens', 'music'],
    fallback: 'crowd_murmur',
  },
  {
    id: 'war_drums',
    label: 'War Drums',
    icon: 'Drum',
    family: 'combat',
    kind: 'bed',
    era: 'historic',
    contains: 'Drums and horns of an approaching army, tense.',
    mustNotContain: ['melody', 'songs', 'engines', 'sirens', 'speech'],
    fallback: 'battle_field',
  },
  {
    id: 'gunfight_ambient',
    label: 'Gunfire',
    icon: 'Crosshair',
    family: 'combat',
    kind: 'bed',
    era: 'modern',
    contains: 'Distant gunfire with echoes and shouting.',
    mustNotContain: ['sirens', 'engines', 'music'],
    fallback: 'battle_field',
  },
  {
    id: 'arena_crowd',
    label: 'Arena Crowd',
    icon: 'Trophy',
    family: 'combat',
    kind: 'bed',
    era: 'modern',
    contains: 'A stadium crowd cheering and jeering, far off.',
    mustNotContain: ['music', 'sirens', 'horns', 'whistles'],
    fallback: 'crowd_murmur',
  },
  {
    id: 'sword_clash',
    label: 'Sword Clash',
    icon: 'Sword',
    family: 'combat',
    kind: 'oneshot',
    era: 'historic',
    contains: 'A single steel-on-steel clash.',
    mustNotContain: ['music', 'speech'],
    fallback: null,
  },
  {
    id: 'gunshot',
    label: 'Gunshot',
    icon: 'Target',
    family: 'combat',
    kind: 'oneshot',
    era: 'modern',
    contains: 'A single gunshot.',
    mustNotContain: ['music', 'speech'],
    fallback: null,
  },
  {
    id: 'explosion_distant',
    label: 'Distant Blast',
    icon: 'Bomb',
    family: 'combat',
    kind: 'oneshot',
    era: 'modern',
    contains: 'A distant boom with rumble.',
    mustNotContain: ['music', 'speech'],
    fallback: null,
  },
  // mystical
  {
    id: 'ritual_chant',
    label: 'Ritual Chant',
    icon: 'Sparkles',
    family: 'mystical',
    kind: 'bed',
    era: 'historic',
    contains: 'Low chanted voices in a ritual, reverberant.',
    mustNotContain: ['instruments', 'engines', 'sirens', 'radio'],
    fallback: 'crowd_murmur',
  },
  {
    id: 'temple_incense',
    label: 'Temple',
    icon: 'Church',
    family: 'mystical',
    kind: 'bed',
    era: 'historic',
    contains: 'A temple interior: soft bells and hushed chanting.',
    mustNotContain: ['instruments', 'engines', 'sirens', 'radio'],
    fallback: 'ritual_chant',
  },
  {
    id: 'monastery_chant',
    label: 'Monastery',
    icon: 'Bell',
    family: 'mystical',
    kind: 'bed',
    era: 'historic',
    contains: 'Monks chanting in a stone hall, long reverberant tones.',
    mustNotContain: ['instruments', 'engines', 'sirens', 'radio'],
    fallback: 'ritual_chant',
  },
  {
    id: 'qi_hum',
    label: 'Qi Aura',
    icon: 'Atom',
    family: 'mystical',
    kind: 'bed',
    era: 'timeless',
    contains: 'A cultivation aura: a low resonant hum, soft wind, a faint shimmer.',
    mustNotContain: ['music', 'speech', 'engines', 'sirens'],
    fallback: 'base_space_hum',
  },
  {
    id: 'spirit_whispers',
    label: 'Spirit Whispers',
    icon: 'Ghost',
    family: 'mystical',
    kind: 'bed',
    era: 'timeless',
    contains: 'Faint, eerie air with unplaceable low tones.',
    mustNotContain: ['speech', 'music', 'engines', 'sirens'],
    fallback: null,
  },
  {
    id: 'magic_shimmer',
    label: 'Magic',
    icon: 'WandSparkles',
    family: 'mystical',
    kind: 'oneshot',
    era: 'timeless',
    contains: 'A spell cast with a rising shimmer.',
    mustNotContain: ['music', 'speech'],
    fallback: null,
  },
  {
    id: 'bell_toll',
    label: 'Bell Toll',
    icon: 'Bell',
    family: 'mystical',
    kind: 'oneshot',
    era: 'historic',
    contains: 'A single temple or church bell toll.',
    mustNotContain: ['music', 'speech'],
    fallback: null,
  },
  // sci-fi (futuristic)
  {
    id: 'starship_bridge',
    label: 'Starship Bridge',
    icon: 'Rocket',
    family: 'sci-fi',
    kind: 'bed',
    era: 'futuristic',
    contains: 'A spaceship bridge: a low electronic hum and faint console tones.',
    mustNotContain: ['music', 'speech', 'sirens'],
    fallback: 'base_space_hum',
  },
  {
    id: 'spaceship_engine',
    label: 'Engine Rumble',
    icon: 'Cog',
    family: 'sci-fi',
    kind: 'bed',
    era: 'futuristic',
    contains: 'A deep engine rumble in a spaceship corridor.',
    mustNotContain: ['music', 'speech', 'sirens'],
    fallback: 'starship_bridge',
  },
  {
    id: 'alien_atmosphere',
    label: 'Alien World',
    icon: 'Telescope',
    family: 'sci-fi',
    kind: 'bed',
    era: 'futuristic',
    contains: 'An alien planet: strange wind, unfamiliar chirps, a low drone.',
    mustNotContain: ['music', 'speech', 'sirens', 'human voices'],
    fallback: 'open_field_wind',
  },
  {
    id: 'space_station',
    label: 'Space Station',
    icon: 'Satellite',
    family: 'sci-fi',
    kind: 'bed',
    era: 'futuristic',
    contains: 'A space station: steady air handling and distant clanks.',
    mustNotContain: ['music', 'speech', 'sirens'],
    fallback: 'starship_bridge',
  },
  {
    id: 'laser_blast',
    label: 'Laser',
    icon: 'Sparkle',
    family: 'sci-fi',
    kind: 'oneshot',
    era: 'futuristic',
    contains: 'A single laser zap.',
    mustNotContain: ['music', 'speech'],
    fallback: null,
  },
  // mood
  {
    id: 'tense_heartbeat',
    label: 'Heartbeat',
    icon: 'HeartPulse',
    family: 'mood',
    kind: 'bed',
    era: 'timeless',
    contains: 'A muffled heartbeat under near silence, for explicit suspense only.',
    mustNotContain: ['music', 'engines', 'sirens', 'speech'],
    fallback: null,
  },
  {
    id: 'clock_ticking',
    label: 'Ticking Clock',
    icon: 'Clock',
    family: 'mood',
    kind: 'bed',
    era: 'historic',
    contains: 'A slow pendulum clock ticking in a quiet room.',
    mustNotContain: ['music', 'engines', 'sirens', 'speech'],
    fallback: 'library_quiet',
  },
  {
    id: 'ominous_drone',
    label: 'Ominous Drone',
    icon: 'Skull',
    family: 'mood',
    kind: 'bed',
    era: 'timeless',
    contains: 'A low, dark drone in a still, cold room, for a horror tone.',
    mustNotContain: ['music', 'speech', 'engines', 'sirens'],
    fallback: 'base_space_hum',
  },
  {
    id: 'ballroom_party',
    label: 'Ballroom',
    icon: 'Music',
    family: 'mood',
    kind: 'bed',
    era: 'historic',
    contains: 'A ballroom or party murmur: glasses and distant chatter, no music.',
    mustNotContain: ['music', 'engines', 'sirens', 'radio'],
    fallback: 'crowd_murmur',
  },
  {
    id: 'rain_on_window',
    label: 'Rain on Glass',
    icon: 'Droplet',
    family: 'mood',
    kind: 'bed',
    era: 'timeless',
    contains: 'Rain against window glass, heard from a warm room.',
    mustNotContain: ['thunder', 'people', 'traffic', 'engines'],
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

/** The era of a playable bed id (a category or a base-pack id), or undefined for an unknown id. */
export function bedEraOf(id: string): AmbienceEra | undefined {
  if (isBasePackId(id)) return BASE_PACK_ERA[id];
  return CATEGORY_BY_ID.get(id)?.era;
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
