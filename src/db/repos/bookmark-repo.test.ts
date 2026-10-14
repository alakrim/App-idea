import { bookmarkRepo } from './bookmark-repo';
import { chapterRepo } from './chapter-repo';
import { seriesRepo } from './series-repo';
import { chapterRow, id, seriesRow, T0 } from '../__fixtures__/factories';
import { createTestDb } from '../__fixtures__/test-db';

import type { Bookmark } from '../../core/domain';

function bookmark(
  n: number,
  chapterN: number,
  sentenceIdx: number,
  note: string | null = null,
): Bookmark {
  return {
    id: id(n),
    seriesId: id(1),
    chapterId: id(chapterN),
    sentenceIdx,
    positionMs: sentenceIdx * 1000,
    note,
    createdAt: T0 + n,
  };
}

function setup() {
  const testDb = createTestDb();
  seriesRepo.insert(testDb.db, seriesRow(1));
  chapterRepo.insert(testDb.db, chapterRow(1, 1, 1));
  chapterRepo.insert(testDb.db, chapterRow(2, 1, 2));
  return testDb;
}

describe('bookmarkRepo', () => {
  it('creates a bookmark and finds it by its sentence', () => {
    const { db } = setup();
    bookmarkRepo.insert(db, bookmark(10, 1, 4));

    expect(bookmarkRepo.findAt(db, id(1), 4)).toEqual(bookmark(10, 1, 4));
    expect(bookmarkRepo.findAt(db, id(1), 5)).toBeNull();
    expect(bookmarkRepo.get(db, id(10))).toEqual(bookmark(10, 1, 4));
  });

  it('refuses a second bookmark on the same sentence', () => {
    const { db } = setup();
    bookmarkRepo.insert(db, bookmark(10, 1, 4));

    expect(() => bookmarkRepo.insert(db, bookmark(11, 1, 4))).toThrow(/UNIQUE/);
  });

  it('lists a series in reading order: by chapter, then by sentence', () => {
    const { db } = setup();
    bookmarkRepo.insert(db, bookmark(10, 2, 0));
    bookmarkRepo.insert(db, bookmark(11, 1, 7));
    bookmarkRepo.insert(db, bookmark(12, 1, 2));

    expect(bookmarkRepo.listForSeriesWithText(db, id(1)).map((b) => b.id)).toEqual([
      id(12),
      id(11),
      id(10),
    ]);
  });

  it('edits and clears the note, then deletes the bookmark', () => {
    const { db } = setup();
    bookmarkRepo.insert(db, bookmark(10, 1, 4));

    bookmarkRepo.updateNote(db, id(10), 'Remember this name');
    expect(bookmarkRepo.get(db, id(10))?.note).toBe('Remember this name');

    bookmarkRepo.updateNote(db, id(10), null);
    expect(bookmarkRepo.get(db, id(10))?.note).toBeNull();

    bookmarkRepo.delete(db, id(10));
    expect(bookmarkRepo.get(db, id(10))).toBeNull();
  });

  it('removes the chapter bookmarks when the chapter is deleted', () => {
    const { db } = setup();
    bookmarkRepo.insert(db, bookmark(10, 1, 4));
    bookmarkRepo.insert(db, bookmark(11, 2, 1));

    chapterRepo.delete(db, id(1));

    expect(bookmarkRepo.listForSeriesWithText(db, id(1)).map((b) => b.id)).toEqual([id(11)]);
  });

  it('removes every bookmark of a series when the series is deleted', () => {
    const { db } = setup();
    bookmarkRepo.insert(db, bookmark(10, 1, 4));

    seriesRepo.delete(db, id(1));

    expect(bookmarkRepo.get(db, id(10))).toBeNull();
  });
});
