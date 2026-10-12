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
