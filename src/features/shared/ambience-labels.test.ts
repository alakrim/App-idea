import { ambienceLabel, humanizeCategory } from './ambience-labels';

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
