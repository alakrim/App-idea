import { collectTranslations, validateAlignment } from './align';

describe('validateAlignment', () => {
  it('is ok when every expected idx comes back once with text', () => {
    expect(
      validateAlignment(
        [0, 1, 2],
        [
          { idx: 2, text: 'c' },
          { idx: 0, text: 'a' },
          { idx: 1, text: 'b' },
        ],
      ),
    ).toEqual({ ok: true, missing: [], extra: [], dupes: [] });
  });

  it('reports missing idx values in ascending order', () => {
    const result = validateAlignment([0, 1, 2, 3], [{ idx: 1, text: 'b' }]);
    expect(result).toEqual({ ok: false, missing: [0, 2, 3], extra: [], dupes: [] });
  });

  it('reports extra idx values that were never sent', () => {
    const result = validateAlignment(
      [0, 1],
      [
        { idx: 0, text: 'a' },
        { idx: 7, text: 'x' },
        { idx: 1, text: 'b' },
        { idx: 3, text: 'y' },
      ],
    );
    expect(result).toEqual({ ok: false, missing: [], extra: [3, 7], dupes: [] });
  });

  it('reports duplicated idx values', () => {
    const result = validateAlignment(
      [0, 1],
      [
        { idx: 0, text: 'a' },
        { idx: 0, text: 'a again' },
        { idx: 1, text: 'b' },
      ],
    );
    expect(result).toEqual({ ok: false, missing: [], extra: [], dupes: [0] });
  });

  it('treats blank text as missing, so the sentence gets repaired', () => {
    const result = validateAlignment(
      [0, 1],
      [
        { idx: 0, text: '   ' },
        { idx: 1, text: 'b' },
      ],
    );
    expect(result).toEqual({ ok: false, missing: [0], extra: [], dupes: [] });
  });

  it('counts a sentence as covered when a later duplicate has the text', () => {
    const result = validateAlignment(
      [0],
      [
        { idx: 0, text: '' },
        { idx: 0, text: 'a' },
      ],
    );
    expect(result).toEqual({ ok: false, missing: [], extra: [], dupes: [0] });
  });

  it('reports every problem at once', () => {
    const result = validateAlignment(
      [0, 1, 2],
      [
        { idx: 0, text: 'a' },
        { idx: 0, text: 'a' },
        { idx: 9, text: 'z' },
      ],
    );
    expect(result).toEqual({ ok: false, missing: [1, 2], extra: [9], dupes: [0] });
  });

  it('handles an empty expectation and an empty reply', () => {
    expect(validateAlignment([], [])).toEqual({ ok: true, missing: [], extra: [], dupes: [] });
    expect(validateAlignment([4], [])).toEqual({ ok: false, missing: [4], extra: [], dupes: [] });
  });
});

describe('collectTranslations', () => {
  it('keeps the first non-blank text for each idx and trims it', () => {
    const map = collectTranslations([
      { idx: 1, text: '  first  ' },
      { idx: 1, text: 'second' },
      { idx: 2, text: ' ' },
    ]);
    expect([...map]).toEqual([[1, 'first']]);
  });

  it('restricts the result to the allowed idx values when given', () => {
    const map = collectTranslations(
      [
        { idx: 1, text: 'one' },
        { idx: 2, text: 'two' },
      ],
      new Set([2]),
    );
    expect([...map]).toEqual([[2, 'two']]);
  });
});
