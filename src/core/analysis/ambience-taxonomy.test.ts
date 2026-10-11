import {
  AMBIENCE_CATEGORIES,
  AMBIENCE_CATEGORY_IDS,
  AMBIENCE_ICON_NAMES,
  BASE_PACK_IDS,
  ENABLED_KINDS,
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
  it('has the 59 R4 categories: 51 beds and 8 oneshots', () => {
    expect(AMBIENCE_CATEGORIES).toHaveLength(59);
    expect(AMBIENCE_CATEGORIES.filter((c) => c.kind === 'bed')).toHaveLength(51);
    expect(AMBIENCE_CATEGORIES.filter((c) => c.kind === 'oneshot')).toHaveLength(8);
  });

  it('uses unique, stable snake_case ids', () => {
    const ids = AMBIENCE_CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(SNAKE_CASE);
    expect(AMBIENCE_CATEGORY_IDS).toEqual(ids);
  });

  it('has the nine R4 families and a description for every category', () => {
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
    for (const c of AMBIENCE_CATEGORIES) expect(c.description.trim().length).toBeGreaterThan(0);
  });

  it('keeps per-family counts that match R4 section 2', () => {
    const counts = new Map<string, number>();
    for (const c of AMBIENCE_CATEGORIES) counts.set(c.family, (counts.get(c.family) ?? 0) + 1);
    expect(Object.fromEntries(counts)).toEqual({
      nature: 7,
      weather: 6,
      urban: 6,
      interiors: 11,
      transport: 6,
      combat: 7,
      mystical: 6,
      'sci-fi': 5,
      mood: 5,
    });
  });

  it('enables beds only in v1', () => {
    expect([...ENABLED_KINDS]).toEqual(['bed']);
    expect(enabledCategories()).toHaveLength(51);
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
