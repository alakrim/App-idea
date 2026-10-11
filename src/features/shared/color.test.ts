import { mixHex, withAlpha } from './color';

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
