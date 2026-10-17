import { chapterRow, id, seriesRow, T0 } from '@/db/__fixtures__/factories';
import { createTestDb } from '@/db/__fixtures__/test-db';
import { bookmarkRepo } from '@/db/repos/bookmark-repo';
import { chapterRepo } from '@/db/repos/chapter-repo';
import { seriesRepo } from '@/db/repos/series-repo';

import { NOTE_MAX_LENGTH } from './bookmark-format';
import { addBookmark, removeBookmark, setBookmarkNote } from './bookmark-service';

function setup() {
  const testDb = createTestDb();
  seriesRepo.insert(testDb.db, seriesRow(1));
  chapterRepo.insert(testDb.db, chapterRow(1, 1, 1));
  let next = 0;
  const deps = {
    db: testDb.db,
    now: () => T0 + 5,
    newId: () => id(100 + next++),
  };
  return { db: testDb.db, deps };
}

const PLACE = { seriesId: id(1), chapterId: id(1), sentenceIdx: 4, positionMs: 9000 };

describe('bookmark service', () => {
  it('adds a bookmark at the place it was made, with no note', () => {
    const { db, deps } = setup();

    const bookmark = addBookmark(deps, PLACE);

    expect(bookmark).toEqual({
      id: id(100),
      seriesId: id(1),
      chapterId: id(1),
      sentenceIdx: 4,
      positionMs: 9000,
      note: null,
      createdAt: T0 + 5,
    });
    expect(bookmarkRepo.findAt(db, id(1), 4)).toEqual(bookmark);
  });

  it('returns the existing bookmark when the sentence is bookmarked again, keeping its note', () => {
    const { db, deps } = setup();
    const first = addBookmark(deps, PLACE);
    setBookmarkNote(db, first.id, 'Check the name');

    const again = addBookmark(deps, PLACE);

    expect(again.id).toBe(first.id);
    expect(again.note).toBe('Check the name');
    expect(bookmarkRepo.listForSeriesWithText(db, id(1))).toHaveLength(1);
  });

  it('edits the note, trimming it, and clears it when it is empty', () => {
    const { db, deps } = setup();
    const bookmark = addBookmark(deps, PLACE);

    setBookmarkNote(db, bookmark.id, '  the harbour master  ');
    expect(bookmarkRepo.get(db, bookmark.id)?.note).toBe('the harbour master');

    setBookmarkNote(db, bookmark.id, ' ');
    expect(bookmarkRepo.get(db, bookmark.id)?.note).toBeNull();
  });

  it('refuses a note over the limit and keeps the old one', () => {
    const { db, deps } = setup();
    const bookmark = addBookmark(deps, PLACE);
    setBookmarkNote(db, bookmark.id, 'kept');

    expect(() => setBookmarkNote(db, bookmark.id, 'x'.repeat(NOTE_MAX_LENGTH + 1))).toThrow(
      /too long/,
    );
    expect(bookmarkRepo.get(db, bookmark.id)?.note).toBe('kept');
  });

  it('refuses a note for a bookmark that does not exist', () => {
    const { db } = setup();

    expect(() => setBookmarkNote(db, id(999), 'x')).toThrow(/does not exist/);
  });

  it('deletes a bookmark', () => {
    const { db, deps } = setup();
    const bookmark = addBookmark(deps, PLACE);

    removeBookmark(db, bookmark.id);

    expect(bookmarkRepo.get(db, bookmark.id)).toBeNull();
  });
});
