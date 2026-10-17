import { unknownCostNote } from './usage';

describe('unknownCostNote (QA-F F-04)', () => {
  it('says nothing when every call has a known cost', () => {
    expect(unknownCostNote(0)).toBeNull();
  });

  it('names a single call with an unknown cost', () => {
    expect(unknownCostNote(1)).toBe('1 call with unknown cost');
  });

  it('counts several calls with an unknown cost', () => {
    expect(unknownCostNote(3)).toBe('3 calls with unknown cost');
  });
});
