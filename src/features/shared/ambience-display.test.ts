import { AMBIENCE_CATEGORIES, AMBIENCE_ICON_NAMES } from '@/core/analysis/ambience-taxonomy';

import { AMBIENCE_ICONS, ambienceIconOf } from './ambience-display';

// Lucide ships untransformed ESM, so the icon components are stubbed. The names are checked here;
// the typecheck checks that every name is a real export.
jest.mock('@/ui/icons', () => {
  // One stub per icon name, so the same icon is the same object wherever it is read.
  const stubs: Record<string, () => null> = {};
  return new Proxy({}, { get: (_target, name: string) => (stubs[name] ??= () => null) });
});

describe('ambience icons', () => {
  it('maps every icon name the taxonomy uses, and nothing else', () => {
    expect(Object.keys(AMBIENCE_ICONS).sort()).toEqual([...AMBIENCE_ICON_NAMES].sort());
  });

  it('gives every category an icon from that map', () => {
    for (const category of AMBIENCE_CATEGORIES) {
      expect(AMBIENCE_ICONS).toHaveProperty([category.icon]);
    }
  });

  it('gives the generic sparkle for an unknown id', () => {
    expect(ambienceIconOf('unknown_thing')).toBe(AMBIENCE_ICONS.Sparkles);
    expect(ambienceIconOf('tavern_crowd')).toBe(AMBIENCE_ICONS.Wine);
  });
});
