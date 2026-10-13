import { resolveBed } from './resolve-bed';
import { AMBIENCE_CATEGORIES, BASE_PACK_IDS, fallbackChain } from '../analysis/ambience-taxonomy';

const ALL_BASE: ReadonlySet<string> = new Set(BASE_PACK_IDS);
const NONE: ReadonlySet<string> = new Set();

describe('resolveBed', () => {
  it('returns the category itself when it is installed', () => {
    expect(resolveBed('horse_gallop', new Set(['horse_gallop', 'base_wind']))).toBe('horse_gallop');
  });

  it('walks the fallback chain to the nearest installed id', () => {
    // horse_gallop -> horse_trot -> open_field_wind -> base_wind
    expect(resolveBed('horse_gallop', new Set(['base_wind']))).toBe('base_wind');
    expect(resolveBed('horse_gallop', new Set(['horse_trot', 'base_wind']))).toBe('horse_trot');
  });

  it('resolves to a base-pack id when only the base pack is installed', () => {
    expect(resolveBed('light_rain', ALL_BASE)).toBe('base_rain');
    expect(resolveBed('ocean_waves', ALL_BASE)).toBe('base_ocean');
    expect(resolveBed('crowd_murmur', ALL_BASE)).toBe('base_crowd');
  });

  it('returns null when nothing on the chain is installed', () => {
    expect(resolveBed('light_rain', NONE)).toBeNull();
  });

  it('returns null for a category whose fallback is null (skipped cue)', () => {
    expect(resolveBed('spirit_whispers', ALL_BASE)).toBeNull();
    expect(resolveBed('tense_heartbeat', ALL_BASE)).toBeNull();
  });

  it('returns null for an unknown id instead of throwing', () => {
    expect(resolveBed('dragon_roar', ALL_BASE)).toBeNull();
  });

  it('returns a base-pack id passed directly when it is installed', () => {
    expect(resolveBed('base_fire', new Set(['base_fire']))).toBe('base_fire');
    expect(resolveBed('base_fire', NONE)).toBeNull();
  });

  describe('with real (Freesound) beds installed under their category ids', () => {
    it('plays the real bed for the exact category ahead of the base pack', () => {
      expect(resolveBed('light_rain', new Set(['light_rain', 'base_rain']))).toBe('light_rain');
    });

    it('prefers the exact real bed over a real bed further along the chain', () => {
      // heavy_rain -> light_rain -> base_rain
      expect(resolveBed('heavy_rain', new Set(['heavy_rain', 'light_rain', 'base_rain']))).toBe(
        'heavy_rain',
      );
      expect(resolveBed('heavy_rain', new Set(['light_rain', 'base_rain']))).toBe('light_rain');
    });

    it('takes a real bed on the chain before the base pack that follows it', () => {
      // jungle_insects -> forest_day_birds -> open_field_wind -> base_wind
      expect(resolveBed('jungle_insects', new Set(['forest_day_birds', 'base_wind']))).toBe(
        'forest_day_birds',
      );
    });

    it('falls past a category with no real bed to the next installed link', () => {
      // ship_deck -> ocean_waves -> base_ocean
      expect(resolveBed('ship_deck', new Set(['base_ocean']))).toBe('base_ocean');
      expect(resolveBed('ship_deck', new Set(['ocean_waves', 'base_ocean']))).toBe('ocean_waves');
    });
  });

  it('resolves every category that has a fallback chain once the base pack is installed', () => {
    for (const category of AMBIENCE_CATEGORIES) {
      const hasChain = fallbackChain(category.id).length > 0;
      const resolved = resolveBed(category.id, ALL_BASE);
      expect({ id: category.id, resolved: resolved !== null }).toEqual({
        id: category.id,
        resolved: hasChain,
      });
    }
  });
});

describe('resolveBed with a chapter era (A4)', () => {
  const EVERYTHING: ReadonlySet<string> = new Set([
    'thunderstorm',
    'heavy_rain',
    'light_rain',
    'base_rain',
    'city_street_day',
    'crowd_murmur',
    'base_crowd',
    'village_square',
    'library_quiet',
    'base_space_hum',
  ]);

  it('plays a timeless thunderstorm in a historic chapter, never a modern bed', () => {
    expect(resolveBed('thunderstorm', EVERYTHING, 'historic')).toBe('thunderstorm');
  });

  it('plays the historic village square for a medieval town, never city_street_day', () => {
    expect(resolveBed('village_square', EVERYTHING, 'historic')).toBe('village_square');
    expect(resolveBed('city_street_day', EVERYTHING, 'historic')).not.toBe('city_street_day');
  });

  it('walks past a modern bed to an era-safe link on its chain, and never picks the modern bed', () => {
    // city_street_day -> crowd_murmur (historic) -> base_crowd (historic); both fit a historic chapter.
    expect(resolveBed('city_street_day', new Set(['city_street_day', 'crowd_murmur']), 'historic')).toBe(
      'crowd_murmur',
    );
  });

  it('skips a cue when no era-safe bed is installed on its chain', () => {
    expect(resolveBed('office_hum', new Set(['office_hum']), 'historic')).toBeNull();
  });

  it('accepts a historic bed in a modern chapter, and a modern bed in a futuristic one', () => {
    expect(resolveBed('crowd_murmur', new Set(['crowd_murmur']), 'modern')).toBe('crowd_murmur');
    expect(resolveBed('city_street_day', new Set(['city_street_day']), 'futuristic')).toBe(
      'city_street_day',
    );
  });

  it('keeps a timeless bed in a timeless chapter and skips a historic one there', () => {
    expect(resolveBed('heavy_rain', new Set(['heavy_rain']), 'timeless')).toBe('heavy_rain');
    expect(resolveBed('crowd_murmur', new Set(['crowd_murmur']), 'timeless')).toBeNull();
  });

  it('treats an unknown chapter era as no constraint, the same as before A4', () => {
    expect(resolveBed('city_street_day', new Set(['city_street_day']), null)).toBe(
      'city_street_day',
    );
    expect(resolveBed('city_street_day', new Set(['city_street_day']))).toBe('city_street_day');
  });

  it('still returns null for an unknown id in an era-constrained chapter', () => {
    expect(resolveBed('dragon_roar', EVERYTHING, 'historic')).toBeNull();
  });
});

