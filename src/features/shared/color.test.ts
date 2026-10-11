import { mixHex, scaleAlpha, withAlpha } from './color';

describe('colour helpers', () => {
  it('turns a hex colour into an rgba string and clamps alpha', () => {
    expect(withAlpha('#E8A84A', 0.5)).toBe('rgba(232,168,74,0.5)');
    expect(withAlpha('#000000', 3)).toBe('rgba(0,0,0,1)');
  });

  it('mixes two colours linearly', () => {
    expect(mixHex('#000000', '#FFFFFF', 0.5)).toBe('#808080');
    expect(mixHex('#102030', '#AABBCC', 0)).toBe('#102030');
  });

  it('rejects malformed hex values', () => {
    expect(() => withAlpha('teal', 0.5)).toThrow('#RRGGBB');
  });
});

describe('scaleAlpha', () => {
  it('scales the alpha of an rgba wash and keeps its colour', () => {
    expect(scaleAlpha('rgba(232,168,74,0.14)', 0.5)).toBe('rgba(232,168,74,0.070)');
    expect(scaleAlpha('rgba(232,168,74,0.14)', 1)).toBe('rgba(232,168,74,0.140)');
    expect(scaleAlpha('rgba(232,168,74,0.14)', 0)).toBe('rgba(232,168,74,0.000)');
  });

  it('clamps the factor to 0 to 1', () => {
    expect(scaleAlpha('rgba(1,2,3,0.5)', 4)).toBe('rgba(1,2,3,0.500)');
  });

  it('rejects a colour that is not an rgba wash', () => {
    expect(() => scaleAlpha('#E8A84A', 0.5)).toThrow(/rgba/);
  });
});
