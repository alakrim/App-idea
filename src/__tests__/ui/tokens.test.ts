import { contrastRatio, flattenOver, parseHex, relativeLuminance } from '@/ui/contrast';
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

describe('flattenOver', () => {
  it('blends a translucent colour over the backdrop it sits on', () => {
    expect(flattenOver('rgba(0,0,0,0.5)', '#FFFFFF')).toBe('#808080');
    expect(flattenOver('rgba(255,255,255,1)', '#000000')).toBe('#FFFFFF');
  });

  it('returns a solid colour unchanged and rejects anything else', () => {
    expect(flattenOver('#875010', '#FFFFFF')).toBe('#875010');
    expect(() => flattenOver('hsl(0,0%,0%)', '#FFFFFF')).toThrow(/solid #RRGGBB/);
  });
});

describe('text colour contrast (WCAG AA: 4.5:1 for text on every surface it sits on)', () => {
  const themes = ['dark', 'light'] as const;
  const surfaces = ['bg', 'surface', 'surfaceRaised'] as const;
  const textTokens = [
    'text',
    'textMuted',
    'textFaint',
    'accent',
    'success',
    'warning',
    'danger',
  ] as const;

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

  for (const scheme of themes) {
    for (const surface of surfaces) {
      it(`${scheme} accentOnSoft meets 4.5:1 on accentSoft over ${surface}`, () => {
        const colors = palette[scheme];
        const soft = flattenOver(colors.accentSoft, colors[surface]);
        expect(contrastRatio(colors.accentOnSoft, soft)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});

describe('control outline contrast (WCAG 1.4.11: 3:1 for a boundary that identifies a control)', () => {
  const themes = ['dark', 'light'] as const;
  const surfaces = ['bg', 'surface', 'surfaceRaised'] as const;

  for (const scheme of themes) {
    for (const surface of surfaces) {
      it(`${scheme} boundary meets 3:1 on ${surface}`, () => {
        const colors = palette[scheme];
        expect(contrastRatio(colors.boundary, colors[surface])).toBeGreaterThanOrEqual(3);
      });
    }
  }
});

describe('onAccent contrast (primary button label)', () => {
  for (const scheme of ['dark', 'light'] as const) {
    it(`${scheme} onAccent meets 4.5:1 on accent`, () => {
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
