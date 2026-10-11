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
