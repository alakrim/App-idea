import { chapterRow, chapterText, id, seriesRow, T0 } from '@/db/__fixtures__/factories';
import { createTestDb } from '@/db/__fixtures__/test-db';
import { bookmarkRepo } from '@/db/repos/bookmark-repo';
import { chapterRepo } from '@/db/repos/chapter-repo';
import { seriesRepo } from '@/db/repos/series-repo';
import { textRepo } from '@/db/repos/text-repo';

import {
  countBookmarks,
  findBookmark,
  findBookmarkById,
  readSeriesBookmarks,
  type BookmarkGroup,
} from './bookmark-data';
import { addBookmark } from './bookmark-service';

describe('readSeriesBookmarks', () => {
  it('groups bookmarks by chapter in reading order, with snippets and the chapter number', () => {
    const { db } = createTestDb();
    seriesRepo.insert(db, seriesRow(1));
    chapterRepo.insert(db, chapterRow(1, 1, 1, { title: 'Dawn' }));
    chapterRepo.insert(db, chapterRow(2, 1, 2, { title: 'Dusk' }));
    textRepo.replaceChapterText(db, id(1), chapterText(1, ['One.', 'Two.', 'Three.']));
    const long = 'x'.repeat(120);
    textRepo.replaceChapterText(db, id(2), chapterText(2, [long]));
    addBookmark(
      { db, now: () => T0, newId: () => id(12) },
      {
        seriesId: id(1),
        chapterId: id(2),
        sentenceIdx: 0,
        positionMs: 0,
      },
    );
    addBookmark(
      { db, now: () => T0, newId: () => id(11) },
      {
        seriesId: id(1),
        chapterId: id(1),
        sentenceIdx: 2,
        positionMs: 5000,
      },
    );
    addBookmark(
      { db, now: () => T0, newId: () => id(10) },
      {
        seriesId: id(1),
        chapterId: id(1),
        sentenceIdx: 0,
        positionMs: 0,
      },
    );

    const groups = readSeriesBookmarks(db, id(1));

    expect(groups.map((g) => [g.chapterNumber, g.chapterTitle])).toEqual([
      [1, 'Dawn'],
      [2, 'Dusk'],
    ]);
    expect(groups[0]?.bookmarks.map((b) => b.sentenceIdx)).toEqual([0, 2]);
    expect(groups[1]?.bookmarks[0]?.snippet).toBe(`${'x'.repeat(80)}…`);
    expect(countBookmarks(groups)).toBe(3);
  });

  it('shows a placeholder snippet when the sentence has been removed', () => {
    const { db, sqlite } = createTestDb();
    seriesRepo.insert(db, seriesRow(1));
    chapterRepo.insert(db, chapterRow(1, 1, 1));
    textRepo.replaceChapterText(db, id(1), chapterText(1, ['One.', 'Two.']));
    bookmarkRepo.insert(db, {
      id: id(10),
      seriesId: id(1),
      chapterId: id(1),
      sentenceIdx: 1,
      positionMs: 0,
      note: null,
      createdAt: T0,
    });
    sqlite.prepare('DELETE FROM sentences WHERE chapter_id = ? AND idx = 1').run(id(1));

    expect(readSeriesBookmarks(db, id(1))[0]?.bookmarks[0]?.snippet).toBe(
      'This sentence is no longer in the chapter',
    );
  });

  it('returns nothing for a series with no bookmarks', () => {
    const { db } = createTestDb();
    seriesRepo.insert(db, seriesRow(1));

    expect(readSeriesBookmarks(db, id(1))).toEqual([]);
  });
});

describe('bookmark lookups', () => {
  const groups: BookmarkGroup[] = [
    {
      chapterId: id(1),
      chapterNumber: 1,
      chapterTitle: 'Dawn',
      bookmarks: [{ id: id(10), sentenceIdx: 4, positionMs: 0, note: null, snippet: 'Lamp' }],
    },
  ];

  it('finds the bookmark on a sentence of a chapter, and nothing elsewhere', () => {
    expect(findBookmark(groups, id(1), 4)?.id).toBe(id(10));
    expect(findBookmark(groups, id(1), 5)).toBeNull();
    expect(findBookmark(groups, id(2), 4)).toBeNull();
    expect(findBookmark(groups, null, 4)).toBeNull();
  });

  it('finds a bookmark by its id, and nothing once it is gone', () => {
    expect(findBookmarkById(groups, id(10))?.sentenceIdx).toBe(4);
    expect(findBookmarkById(groups, id(99))).toBeNull();
  });
});
