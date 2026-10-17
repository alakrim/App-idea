import {
  NOTE_MAX_LENGTH,
  SNIPPET_LENGTH,
  bookmarkCountLabel,
  bookmarkSnippet,
  normalizeNote,
} from './bookmark-format';

describe('bookmarkSnippet', () => {
  it('keeps a short sentence whole and trims its spaces', () => {
    expect(bookmarkSnippet('  The lamp burned low.  ')).toBe('The lamp burned low.');
  });

  it('cuts a long sentence to the snippet length, on a whole character', () => {
    const text = `${'é'.repeat(SNIPPET_LENGTH + 10)}`;

    expect(bookmarkSnippet(text)).toBe(`${'é'.repeat(SNIPPET_LENGTH)}…`);
  });

  it('says so when the sentence is gone', () => {
    expect(bookmarkSnippet(null)).toBe('This sentence is no longer in the chapter');
  });
});

describe('normalizeNote', () => {
  it('stores a trimmed note, and null for an empty one', () => {
    expect(normalizeNote('  a name to check  ')).toEqual({ ok: true, note: 'a name to check' });
    expect(normalizeNote('   ')).toEqual({ ok: true, note: null });
  });

  it('refuses a note over the limit, counting characters', () => {
    expect(normalizeNote('x'.repeat(NOTE_MAX_LENGTH))).toEqual({
      ok: true,
      note: 'x'.repeat(NOTE_MAX_LENGTH),
    });
    expect(normalizeNote('x'.repeat(NOTE_MAX_LENGTH + 1))).toEqual({ ok: false });
  });
});

describe('bookmarkCountLabel', () => {
  it('reads the count in the right form', () => {
    expect(bookmarkCountLabel(0)).toBe('No bookmarks yet');
    expect(bookmarkCountLabel(1)).toBe('1 bookmark');
    expect(bookmarkCountLabel(4)).toBe('4 bookmarks');
  });
});
