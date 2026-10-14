import { and, asc, eq } from 'drizzle-orm';

import { bookmarks, chapters, sentences } from '../schema';

import type { Bookmark } from '../../core/domain';
import type { Db } from '../types';

type BookmarkRow = typeof bookmarks.$inferSelect;

function toBookmark(row: BookmarkRow): Bookmark {
  return {
    id: row.id,
    seriesId: row.seriesId,
    chapterId: row.chapterId,
    sentenceIdx: row.sentenceIdx,
    positionMs: row.positionMs,
    note: row.note,
    createdAt: row.createdAt,
  };
}

/** Bookmarks, in reading order: by chapter, then by sentence. */
export const bookmarkRepo = {
  /**
   * Every bookmark of a series with the text of its sentence, for the list. The text is null only if
   * the sentence has since been removed, which a re-clean can cause.
   */
  listForSeriesWithText(db: Db, seriesId: string): (Bookmark & { sentenceText: string | null })[] {
    return db
      .select({
        id: bookmarks.id,
        seriesId: bookmarks.seriesId,
        chapterId: bookmarks.chapterId,
        sentenceIdx: bookmarks.sentenceIdx,
        positionMs: bookmarks.positionMs,
        note: bookmarks.note,
        createdAt: bookmarks.createdAt,
        sentenceText: sentences.text,
      })
      .from(bookmarks)
      .innerJoin(chapters, eq(chapters.id, bookmarks.chapterId))
      .leftJoin(
        sentences,
        and(eq(sentences.chapterId, bookmarks.chapterId), eq(sentences.idx, bookmarks.sentenceIdx)),
      )
      .where(eq(bookmarks.seriesId, seriesId))
      .orderBy(asc(chapters.order), asc(bookmarks.sentenceIdx))
      .all()
      .map(({ sentenceText, ...row }) => ({ ...toBookmark(row), sentenceText }));
  },

  get(db: Db, id: string): Bookmark | null {
    const row = db.select().from(bookmarks).where(eq(bookmarks.id, id)).get();
    return row ? toBookmark(row) : null;
  },

  /** The bookmark on one sentence, or null. A sentence holds at most one. */
  findAt(db: Db, chapterId: string, sentenceIdx: number): Bookmark | null {
    const row = db
      .select()
      .from(bookmarks)
      .where(and(eq(bookmarks.chapterId, chapterId), eq(bookmarks.sentenceIdx, sentenceIdx)))
      .get();
    return row ? toBookmark(row) : null;
  },

  insert(db: Db, row: Bookmark): void {
    db.insert(bookmarks).values(row).run();
  },

  updateNote(db: Db, id: string, note: string | null): void {
    db.update(bookmarks).set({ note }).where(eq(bookmarks.id, id)).run();
  },

  delete(db: Db, id: string): void {
    db.delete(bookmarks).where(eq(bookmarks.id, id)).run();
  },
};
