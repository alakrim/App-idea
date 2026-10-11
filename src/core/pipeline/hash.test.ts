import { hashText, stableHash } from './hash';

describe('hashText', () => {
  it('is deterministic and 16 hex characters long', () => {
    expect(hashText('chapter')).toBe(hashText('chapter'));
    expect(hashText('chapter')).toMatch(/^[0-9a-f]{16}$/u);
  });

  it('differs for different text, including a single changed character', () => {
    expect(hashText('chapter one')).not.toBe(hashText('chapter two'));
    expect(hashText('')).not.toBe(hashText(' '));
  });
});

describe('stableHash', () => {
  it('depends on the order and the boundaries of the parts', () => {
    expect(stableHash(['ab', 'c'])).not.toBe(stableHash(['a', 'bc']));
    expect(stableHash(['x', 'y'])).not.toBe(stableHash(['y', 'x']));
  });

  it('hashes structured values by content', () => {
    expect(stableHash([{ voice: 'Kore' }, 1])).toBe(stableHash([{ voice: 'Kore' }, 1]));
    expect(stableHash([{ voice: 'Kore' }])).not.toBe(stableHash([{ voice: 'Puck' }]));
    expect(stableHash([null])).not.toBe(stableHash([0]));
  });
});
