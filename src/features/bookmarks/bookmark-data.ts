import { getTableName } from 'drizzle-orm';

import { bookmarkRepo } from '@/db/repos/bookmark-repo';
import { chapterRepo } from '@/db/repos/chapter-repo';
import { bookmarks, chapters } from '@/db/schema';
import type { Db } from '@/db/types';

import { bookmarkSnippet } from './bookmark-format';

/** Tables the bookmark list reads. A write to any of them re-runs the read. */
export const BOOKMARK_TABLES = [getTableName(bookmarks), getTableName(chapters)];

export interface BookmarkItem {
  id: string;
  sentenceIdx: number;
  positionMs: number;
  note: string | null;
  /** The sentence, cut for the list. */
  snippet: string;
}

/** The bookmarks of one chapter, under the chapter's place in the series. */
export interface BookmarkGroup {
  chapterId: string;
  /** 1-based, the number the chapter has in the series. */
  chapterNumber: number;
  chapterTitle: string;
  bookmarks: BookmarkItem[];
}

/** Bookmarks of a series, grouped by chapter in reading order. Only chapters that exist appear. */
export function readSeriesBookmarks(db: Db, seriesId: string): BookmarkGroup[] {
  const numbers = new Map(
    chapterRepo
      .listBySeries(db, seriesId)
      .map((chapter, index) => [chapter.id, { number: index + 1, title: chapter.title }]),
  );
  const groups: BookmarkGroup[] = [];
  for (const row of bookmarkRepo.listForSeriesWithText(db, seriesId)) {
    const chapter = numbers.get(row.chapterId);
    if (!chapter) continue;
    const item: BookmarkItem = {
      id: row.id,
      sentenceIdx: row.sentenceIdx,
      positionMs: row.positionMs,
      note: row.note,
      snippet: bookmarkSnippet(row.sentenceText),
    };
    const last = groups.at(-1);
    if (last?.chapterId === row.chapterId) {
      last.bookmarks.push(item);
    } else {
      groups.push({
        chapterId: row.chapterId,
        chapterNumber: chapter.number,
        chapterTitle: chapter.title,
        bookmarks: [item],
      });
    }
  }
  return groups;
}

/** Total bookmarks across the groups. */
export function countBookmarks(groups: readonly BookmarkGroup[]): number {
  return groups.reduce((sum, group) => sum + group.bookmarks.length, 0);
}

/** The bookmark on one sentence of a chapter, or null. */
export function findBookmark(
  groups: readonly BookmarkGroup[],
  chapterId: string | null,
  sentenceIdx: number,
): BookmarkItem | null {
  if (chapterId === null) return null;
  const group = groups.find((g) => g.chapterId === chapterId);
  return group?.bookmarks.find((b) => b.sentenceIdx === sentenceIdx) ?? null;
}

/** A bookmark by its id, or null once it has been deleted. */
export function findBookmarkById(
  groups: readonly BookmarkGroup[],
  bookmarkId: string,
): BookmarkItem | null {
  for (const group of groups) {
    const found = group.bookmarks.find((b) => b.id === bookmarkId);
    if (found) return found;
  }
  return null;
}
