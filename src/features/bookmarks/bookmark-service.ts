import { newId as defaultNewId } from '@/core/domain';
import type { Bookmark, IdGenerator } from '@/core/domain';
import { bookmarkRepo } from '@/db/repos/bookmark-repo';
import type { Db } from '@/db/types';

import { normalizeNote } from './bookmark-format';

export interface BookmarkServiceDeps {
  db: Db;
  now: () => number;
  newId?: IdGenerator;
}

export interface BookmarkPlace {
  seriesId: string;
  chapterId: string;
  sentenceIdx: number;
  positionMs: number;
}

/**
 * Bookmarks the sentence. A sentence holds one bookmark, so bookmarking it again returns the one
 * already there, with its note.
 */
export function addBookmark(deps: BookmarkServiceDeps, place: BookmarkPlace): Bookmark {
  const existing = bookmarkRepo.findAt(deps.db, place.chapterId, place.sentenceIdx);
  if (existing) return existing;
  const bookmark: Bookmark = {
    id: (deps.newId ?? defaultNewId)(),
    seriesId: place.seriesId,
    chapterId: place.chapterId,
    sentenceIdx: place.sentenceIdx,
    positionMs: place.positionMs,
    note: null,
    createdAt: deps.now(),
  };
  bookmarkRepo.insert(deps.db, bookmark);
  return bookmark;
}

/** Saves a note. Throws when the note is too long, and nothing is written. */
export function setBookmarkNote(db: Db, id: string, raw: string): void {
  const result = normalizeNote(raw);
  if (!result.ok) throw new Error('The note is too long.');
  if (bookmarkRepo.get(db, id) === null) throw new Error(`Bookmark ${id} does not exist`);
  bookmarkRepo.updateNote(db, id, result.note);
}

export function removeBookmark(db: Db, id: string): void {
  bookmarkRepo.delete(db, id);
}
