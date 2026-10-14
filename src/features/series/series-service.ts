import type { IdGenerator } from '@/core/domain';
import { chapterRepo } from '@/db/repos/chapter-repo';
import { jobRepo } from '@/db/repos/job-repo';
import { seriesRepo } from '@/db/repos/series-repo';
import { textRepo } from '@/db/repos/text-repo';
import type { Db } from '@/db/types';

export const SERIES_NAME_MAX = 80;

export interface SeriesFormValues {
  title: string;
  coverUri: string | null;
  coverTint: string | null;
  sourceLang: string | null;
  targetLang: string | null;
}

/** Files the library owns. Removing a missing file is not an error. */
export interface SeriesFiles {
  deleteFile(uri: string): void;
  deleteChapterFiles(chapterId: string): void;
}

export interface SeriesServiceDeps {
  db: Db;
  files: SeriesFiles;
  newId: IdGenerator;
  now: () => number;
}

/** The message to show under the name field, or null when the name is usable. */
export function validateSeriesName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed === '') return 'Give your series a name.';
  if (Array.from(trimmed).length > SERIES_NAME_MAX) {
    return `Keep the name under ${SERIES_NAME_MAX} characters.`;
  }
  return null;
}

function assertValid(values: SeriesFormValues): void {
  const problem = validateSeriesName(values.title);
  if (problem !== null) throw new Error(problem);
}

export function createSeries(deps: SeriesServiceDeps, values: SeriesFormValues): string {
  assertValid(values);
  const now = deps.now();
  const id = deps.newId();
  seriesRepo.insert(deps.db, {
    id,
    title: values.title.trim(),
    coverUri: values.coverUri,
    coverTint: values.coverTint,
    sourceLang: values.sourceLang,
    targetLang: values.targetLang,
    narrationProfileId: null,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export function updateSeries(
  deps: SeriesServiceDeps,
  seriesId: string,
  values: SeriesFormValues,
): void {
  assertValid(values);
  const existing = seriesRepo.get(deps.db, seriesId);
  if (!existing) throw new Error(`Series ${seriesId} does not exist`);
  const languageChanged = existing.targetLang !== values.targetLang;
  deps.db.transaction((tx) => {
    seriesRepo.update(tx, seriesId, {
      title: values.title.trim(),
      coverUri: values.coverUri,
      coverTint: values.coverTint,
      sourceLang: values.sourceLang,
      targetLang: values.targetLang,
      updatedAt: deps.now(),
    });
    // Translations in the old target language would be read aloud in the new voice, so they go with
    // the change, together with the translate jobs that say they are done.
    if (languageChanged) {
      textRepo.clearTranslationsOfSeries(tx, seriesId);
      jobRepo.deleteStageForSeries(tx, seriesId, 'translate');
    }
  });
  // A replaced cover is no longer referenced, so its file goes too.
  if (existing.coverUri !== null && existing.coverUri !== values.coverUri) {
    deps.files.deleteFile(existing.coverUri);
  }
}

/** Deletes the series, its chapters (by cascade) and every file they own. */
export function deleteSeries(deps: SeriesServiceDeps, seriesId: string): void {
  const existing = seriesRepo.get(deps.db, seriesId);
  for (const chapter of chapterRepo.listBySeries(deps.db, seriesId)) {
    deps.files.deleteChapterFiles(chapter.id);
  }
  seriesRepo.delete(deps.db, seriesId);
  if (existing?.coverUri) deps.files.deleteFile(existing.coverUri);
}

export function deleteChapter(deps: SeriesServiceDeps, chapterId: string): void {
  chapterRepo.delete(deps.db, chapterId);
  deps.files.deleteChapterFiles(chapterId);
}

export type MoveDirection = 'up' | 'down';

/**
 * Moves a chapter one place up or down. Moving past the first or last chapter does nothing. The
 * neighbours are read from the list without the moved chapter, which is what `moveBetween` expects.
 */
export function moveChapter(
  deps: SeriesServiceDeps,
  chapterId: string,
  direction: MoveDirection,
): void {
  const chapter = chapterRepo.get(deps.db, chapterId);
  if (!chapter) throw new Error(`Chapter ${chapterId} does not exist`);
  const siblings = chapterRepo.listBySeries(deps.db, chapter.seriesId);
  const index = siblings.findIndex((c) => c.id === chapterId);
  const target = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= siblings.length) return;

  const others = siblings.filter((c) => c.id !== chapterId);
  const previous = direction === 'up' ? others[index - 2] : others[index];
  const next = direction === 'up' ? others[index - 1] : others[index + 1];
  chapterRepo.moveBetween(
    deps.db,
    chapterId,
    { previousId: previous?.id ?? null, nextId: next?.id ?? null },
    deps.now(),
  );
}
