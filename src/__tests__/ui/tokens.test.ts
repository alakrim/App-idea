import { contrastRatio, parseHex, relativeLuminance } from '@/ui/contrast';
import { fontAssets } from '@/ui/fonts';
import { resolveScheme } from '@/ui/theme';
import { palette, fontFamily, typography } from '@/ui/tokens';

describe('WCAG contrast helpers', () => {
  it('reports 21:1 for black on white and 1:1 for identical colours', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#808080', '#808080')).toBeCloseTo(1, 5);
  });

  it('parses only solid #RRGGBB colours', () => {
    expect(parseHex('#E8A84A')).toEqual({ r: 232, g: 168, b: 74 });
    expect(() => parseHex('rgba(0,0,0,0.6)')).toThrow(/solid #RRGGBB/);
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 5);
  });
});

describe('text colour contrast (design-system.md: AA on bg and surface)', () => {
  const themes = ['dark', 'light'] as const;
  const surfaces = ['bg', 'surface'] as const;
  const textTokens = ['text', 'textMuted'] as const;

  for (const scheme of themes) {
    for (const surface of surfaces) {
      for (const token of textTokens) {
        it(`${scheme} ${token} on ${surface} meets 4.5:1`, () => {
          const colors = palette[scheme];
          expect(contrastRatio(colors[token], colors[surface])).toBeGreaterThanOrEqual(4.5);
        });
      }
    }
  }
});

describe('accent contrast (UI review: light accent must be readable as text)', () => {
  const themes = ['dark', 'light'] as const;

  for (const scheme of themes) {
    it(`${scheme} accent meets 4.5:1 on bg and surface`, () => {
      const colors = palette[scheme];
      expect(contrastRatio(colors.accent, colors.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(colors.accent, colors.surface)).toBeGreaterThanOrEqual(4.5);
    });

    it(`${scheme} onAccent meets 4.5:1 on accent (primary button label)`, () => {
      const colors = palette[scheme];
      expect(contrastRatio(colors.onAccent, colors.accent)).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe('theme scheme resolution', () => {
  it('follows the system scheme in system mode and defaults to dark when unknown', () => {
    expect(resolveScheme('system', 'light')).toBe('light');
    expect(resolveScheme('system', 'dark')).toBe('dark');
    expect(resolveScheme('system', null)).toBe('dark');
  });

  it('lets the user override the system scheme', () => {
    expect(resolveScheme('light', 'dark')).toBe('light');
    expect(resolveScheme('dark', 'light')).toBe('dark');
  });
});

describe('font wiring', () => {
  it('registers every family name that tokens.ts refers to', () => {
    const registered = new Set(Object.keys(fontAssets));
    const used = [...Object.values(fontFamily.inter), ...Object.values(fontFamily.literata)];

    for (const family of used) {
      expect(registered.has(family)).toBe(true);
    }
    for (const style of Object.values(typography)) {
      expect(used).toContain(style.fontFamily);
    }
  });
});
