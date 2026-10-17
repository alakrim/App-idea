import { AMBIENCE_CATEGORIES, BASE_PACK_IDS, fallbackChain } from '@/core/analysis/ambience-taxonomy';
import { resolveBed } from '@/core/playback/resolve-bed';

import { INSTALLED_BED_IDS, isInstalledBedId } from './installed-beds';

const INSTALLED: ReadonlySet<string> = new Set(INSTALLED_BED_IDS);
const CATEGORY_IDS: readonly string[] = AMBIENCE_CATEGORIES.map((c) => c.id);
const CATEGORY_BEDS = CATEGORY_IDS.filter((id) => isInstalledBedId(id));

describe('installed ambience beds', () => {
  it('lists each id once, and every id is a taxonomy category or a base-pack id', () => {
    expect(new Set(INSTALLED_BED_IDS).size).toBe(INSTALLED_BED_IDS.length);
    const known = new Set<string>([...CATEGORY_IDS, ...BASE_PACK_IDS]);
    for (const id of INSTALLED_BED_IDS) expect(known.has(id)).toBe(true);
  });

  it('installs at least 30 category beds (brief SND1)', () => {
    expect(CATEGORY_BEDS.length).toBeGreaterThanOrEqual(30);
  });

  it('resolves every installed category to its own bed', () => {
    for (const id of CATEGORY_BEDS) expect(resolveBed(id, INSTALLED)).toBe(id);
  });

  it('resolves every other category through its fallback chain, or skips it', () => {
    for (const id of CATEGORY_IDS) {
      if (INSTALLED.has(id)) continue;
      const resolved = resolveBed(id, INSTALLED);
      if (resolved === null) {
        expect(fallbackChain(id).some((next) => INSTALLED.has(next))).toBe(false);
        continue;
      }
      expect(INSTALLED.has(resolved)).toBe(true);
      expect(fallbackChain(id)).toContain(resolved);
    }
  });

  it('gives the three categories that had no fallback a bed of their own', () => {
    for (const id of ['spirit_whispers', 'tense_heartbeat', 'clock_ticking']) {
      expect(resolveBed(id, INSTALLED)).toBe(id);
    }
  });

  it('falls back to the nearest installed family bed for a category without one', () => {
    expect(resolveBed('horse_gallop', INSTALLED)).toBe('horse_trot');
    expect(resolveBed('open_field_wind', INSTALLED)).toBe('base_wind');
    expect(resolveBed('thunder_clap', INSTALLED)).toBeNull();
  });
});
