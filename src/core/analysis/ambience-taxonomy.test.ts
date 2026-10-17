import {
  AMBIENCE_CATEGORIES,
  AMBIENCE_CATEGORY_IDS,
  AMBIENCE_ERAS,
  AMBIENCE_ICON_NAMES,
  BASE_PACK_ERA,
  BASE_PACK_IDS,
  ENABLED_KINDS,
  bedEraOf,
  bedFitsEra,
  enabledCategories,
  fallbackChain,
  getCategory,
  isBasePackId,
  isEnabledKind,
} from './ambience-taxonomy';

const SNAKE_CASE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

/** Title Case, with the short words lower case when they sit inside the label. */
const TITLE_CASE_WORD = /^[A-Z][a-z]*$/;
const SMALL_WORDS = new Set(['at', 'by', 'on', 'of']);

describe('ambience display labels and icons', () => {
  it('gives every category an English label of at most 18 characters in Title Case', () => {
    for (const c of AMBIENCE_CATEGORIES) {
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.label.length).toBeLessThanOrEqual(18);
      const words = c.label.split(' ');
      words.forEach((word, index) => {
        const ok = TITLE_CASE_WORD.test(word) || (index > 0 && SMALL_WORDS.has(word));
        expect({ id: c.id, word, ok }).toEqual({ id: c.id, word, ok: true });
      });
    }
  });

  it('gives every category a lucide icon name from the shared list', () => {
    for (const c of AMBIENCE_CATEGORIES) {
      expect(AMBIENCE_ICON_NAMES).toContain(c.icon);
    }
  });

  it('keeps labels unique, so the sheet never shows two categories the same way', () => {
    const labels = AMBIENCE_CATEGORIES.map((c) => c.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('ambience taxonomy integrity', () => {
  it('has 65 beds (the 51 shipped beds plus 14 A4 beds) and the 8 oneshots', () => {
    expect(AMBIENCE_CATEGORIES).toHaveLength(73);
    expect(AMBIENCE_CATEGORIES.filter((c) => c.kind === 'bed')).toHaveLength(65);
    expect(AMBIENCE_CATEGORIES.filter((c) => c.kind === 'oneshot')).toHaveLength(8);
  });

  it('keeps every id that shipped in v1, so stored cues still resolve', () => {
    const shipped = [
      'forest_day_birds', 'forest_night', 'open_field_wind', 'mountain_wind', 'ocean_waves',
      'river_stream', 'jungle_insects', 'light_rain', 'heavy_rain', 'storm_wind', 'snowfall_quiet',
      'blizzard_wind', 'thunder_clap', 'city_street_day', 'city_night', 'market_crowd',
      'village_square', 'harbor_port', 'crowd_murmur', 'tavern_crowd', 'castle_hall',
      'fireplace_crackle', 'kitchen_busy', 'office_hum', 'library_quiet', 'hospital_ward',
      'prison_cell', 'cafe_soft', 'lecture_hall', 'door_slam', 'horse_trot', 'horse_gallop',
      'carriage_wheels', 'ship_deck', 'train_interior', 'airplane_cabin', 'battle_field',
      'war_drums', 'gunfight_ambient', 'arena_crowd', 'sword_clash', 'gunshot',
      'explosion_distant', 'ritual_chant', 'temple_incense', 'qi_hum', 'spirit_whispers',
      'magic_shimmer', 'bell_toll', 'starship_bridge', 'spaceship_engine', 'alien_atmosphere',
      'space_station', 'laser_blast', 'tense_heartbeat', 'clock_ticking', 'ominous_drone',
      'ballroom_party', 'rain_on_window',
    ];
    for (const id of shipped) expect({ id, found: getCategory(id) !== undefined }).toEqual({ id, found: true });
  });

  it('gives every category an era from the four A4 eras', () => {
    for (const c of AMBIENCE_CATEGORIES) expect(AMBIENCE_ERAS).toContain(c.era);
  });

  it('meets the A4 era mix: about 30 timeless, 12+ historic, 6+ modern, 2+ futuristic beds', () => {
    const beds = AMBIENCE_CATEGORIES.filter((c) => c.kind === 'bed');
    const count = (era: string) => beds.filter((c) => c.era === era).length;
    expect(count('timeless')).toBeGreaterThanOrEqual(27);
    expect(count('historic')).toBeGreaterThanOrEqual(12);
    expect(count('modern')).toBeGreaterThanOrEqual(6);
    expect(count('futuristic')).toBeGreaterThanOrEqual(2);
  });

  it('gives every category a one-line contains description and a non-empty mustNotContain list', () => {
    for (const c of AMBIENCE_CATEGORIES) {
      expect(c.contains.trim().length).toBeGreaterThan(0);
      expect(c.contains).not.toContain('\n');
      expect({ id: c.id, n: c.mustNotContain.length > 0 }).toEqual({ id: c.id, n: true });
    }
  });

  it('keeps every mustNotContain list clean: trimmed, lower case, non-empty and without duplicates', () => {
    for (const c of AMBIENCE_CATEGORIES) {
      const items: readonly string[] = c.mustNotContain;
      const clean = items.every((item) => item === item.trim().toLowerCase() && item !== '');
      const unique = new Set(c.mustNotContain).size === c.mustNotContain.length;
      expect({ id: c.id, clean, unique }).toEqual({ id: c.id, clean: true, unique: true });
    }
  });

  it('uses unique, stable snake_case ids', () => {
    const ids = AMBIENCE_CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(SNAKE_CASE);
    expect(AMBIENCE_CATEGORY_IDS).toEqual(ids);
  });

  it('has the nine R4 families for every category', () => {
    const families = [...new Set(AMBIENCE_CATEGORIES.map((c) => c.family))].sort();
    expect(families).toEqual(
      [
        'combat',
        'interiors',
        'mood',
        'mystical',
        'nature',
        'sci-fi',
        'transport',
        'urban',
        'weather',
      ].sort(),
    );
  });

  it('keeps per-family counts for the A4 taxonomy', () => {
    const counts = new Map<string, number>();
    for (const c of AMBIENCE_CATEGORIES) counts.set(c.family, (counts.get(c.family) ?? 0) + 1);
    expect(Object.fromEntries(counts)).toEqual({
      nature: 16,
      weather: 8,
      urban: 6,
      interiors: 12,
      transport: 7,
      combat: 7,
      mystical: 7,
      'sci-fi': 5,
      mood: 5,
    });
  });

  it('enables beds only in v1', () => {
    expect([...ENABLED_KINDS]).toEqual(['bed']);
    expect(enabledCategories()).toHaveLength(65);
    expect(isEnabledKind('bed')).toBe(true);
    expect(isEnabledKind('oneshot')).toBe(false);
  });

  it('gives oneshots no fallback and points every fallback at an existing bed or a base id', () => {
    for (const c of AMBIENCE_CATEGORIES) {
      if (c.kind === 'oneshot') {
        expect(c.fallback).toBeNull();
        continue;
      }
      if (c.fallback === null) continue;
      if (isBasePackId(c.fallback)) continue;
      const target = getCategory(c.fallback);
      expect(target).toBeDefined();
      expect(target?.kind).toBe('bed');
    }
  });

  it('keeps base-pack ids disjoint from category ids', () => {
    const ids = new Set<string>(AMBIENCE_CATEGORY_IDS);
    for (const base of BASE_PACK_IDS) expect(ids.has(base)).toBe(false);
  });
});

describe('eras', () => {
  it('gives each base-pack bed an era, with the procedural hum timeless', () => {
    for (const id of BASE_PACK_IDS) expect(BASE_PACK_ERA[id]).toBeDefined();
    expect(BASE_PACK_ERA.base_space_hum).toBe('timeless');
    expect(BASE_PACK_ERA.base_crowd).toBe('historic');
  });

  it('looks up the era of a category or a base-pack id, and undefined for an unknown id', () => {
    expect(bedEraOf('thunderstorm')).toBe('timeless');
    expect(bedEraOf('city_street_day')).toBe('modern');
    expect(bedEraOf('base_crowd')).toBe('historic');
    expect(bedEraOf('dragon_roar')).toBeUndefined();
  });

  it('accepts every bed in a chapter of unknown era', () => {
    for (const era of AMBIENCE_ERAS) expect(bedFitsEra(era, null)).toBe(true);
  });

  it('accepts a bed only when its era fits the chapter, following the A4 matrix', () => {
    const accepts = (chapter: (typeof AMBIENCE_ERAS)[number]) =>
      AMBIENCE_ERAS.filter((bed) => bedFitsEra(bed, chapter));
    expect(accepts('timeless')).toEqual(['timeless']);
    expect(accepts('historic')).toEqual(['timeless', 'historic']);
    expect(accepts('modern')).toEqual(['timeless', 'historic', 'modern']);
    expect(accepts('futuristic')).toEqual(['timeless', 'modern', 'futuristic']);
  });

  it('never lets a modern bed into a historic chapter', () => {
    expect(bedFitsEra('modern', 'historic')).toBe(false);
    expect(bedFitsEra('futuristic', 'historic')).toBe(false);
  });
});

describe('fallback chains', () => {
  it('terminates for every bed, with no cycles, ending at a base-pack id or skipping', () => {
    for (const bed of AMBIENCE_CATEGORIES.filter((c) => c.kind === 'bed')) {
      const chain = fallbackChain(bed.id);
      expect(chain.length).toBeLessThan(AMBIENCE_CATEGORIES.length);
      expect(new Set(chain).size).toBe(chain.length);
      if (bed.fallback === null) {
        expect(chain).toEqual([]);
      } else {
        const last = chain[chain.length - 1];
        expect(last !== undefined && isBasePackId(last)).toBe(true);
      }
    }
  });

  it('resolves a known chain in order', () => {
    expect(fallbackChain('horse_gallop')).toEqual(['horse_trot', 'open_field_wind', 'base_wind']);
    expect(fallbackChain('light_rain')).toEqual(['base_rain']);
  });

  it('returns an empty chain for skipped beds', () => {
    expect(fallbackChain('spirit_whispers')).toEqual([]);
    expect(fallbackChain('tense_heartbeat')).toEqual([]);
  });

  it('rejects unknown ids', () => {
    expect(() => fallbackChain('not_a_category')).toThrow('unknown ambience category');
  });
});
