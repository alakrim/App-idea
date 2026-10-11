import { ambienceIconOf, ambienceLabel, humanizeCategory } from './ambience-display';

import { AMBIENCE_CATEGORIES } from '@/core/analysis/ambience-taxonomy';

describe('ambienceLabel', () => {
  it('uses the taxonomy label for a known category', () => {
    expect(ambienceLabel('tavern_crowd')).toBe('Tavern');
    expect(ambienceLabel('light_rain')).toBe('Light Rain');
  });

  it('humanizes an id the taxonomy does not know', () => {
    expect(humanizeCategory('unknown_thing')).toBe('Unknown thing');
    expect(ambienceLabel('unknown_thing')).toBe('Unknown thing');
  });
});

describe('ambienceIconOf', () => {
  it('returns a component for every taxonomy category, so every icon name is mapped', () => {
    for (const category of AMBIENCE_CATEGORIES) {
      expect(typeof ambienceIconOf(category.id)).toBe('function');
    }
  });

  it('gives the generic sparkle for an unknown id', () => {
    expect(ambienceIconOf('unknown_thing')).toBe(ambienceIconOf('ritual_chant'));
  });
});
