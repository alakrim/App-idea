import { coverGradientFor, monogramFor } from '@/ui/cover-gradient';
import { coverGradients } from '@/ui/tokens';

describe('coverGradientFor', () => {
  it('is stable for the same title', () => {
    expect(coverGradientFor('The Night Harbour')).toEqual(coverGradientFor('The Night Harbour'));
  });

  it('always returns one of the palette pairs', () => {
    const pairs = coverGradients.map(([from, to]) => `${from}|${to}`);
    for (const title of ['A', 'Dune', '夜の図書館', '🎧 Listen', '']) {
      const { from, to } = coverGradientFor(title);
      expect(pairs).toContain(`${from}|${to}`);
    }
  });
});

describe('monogramFor', () => {
  it('uses the first uppercased letter of the trimmed title', () => {
    expect(monogramFor('  the night harbour')).toBe('T');
  });

  it('keeps a whole CJK character and a whole emoji', () => {
    expect(monogramFor('夜の図書館')).toBe('夜');
    expect(monogramFor('🎧 Listen')).toBe('🎧');
  });

  it('falls back to a placeholder for an empty title', () => {
    expect(monogramFor('   ')).toBe('?');
  });
});
