import { Directory, File, Paths } from 'expo-file-system';

import { IdSchema } from '../core/domain';

/**
 * Library files live under the document directory, so the OS never deletes them:
 *   covers/                 series cover images
 *   sources/<chapterId>/    raw HTML or PDF of each chapter
 *   audio/<chapterId>/      narration segments
 *   previews/               cached voice previews
 * Directories are created on first access.
 */

export const LIBRARY_DIRECTORIES = ['covers', 'sources', 'audio', 'previews'] as const;
export type LibraryDirectoryName = (typeof LIBRARY_DIRECTORIES)[number];

export interface LibraryUsage {
  totalBytes: number;
  byDirectory: Record<LibraryDirectoryName, number>;
}

function assertChapterId(chapterId: string): void {
  // Chapter ids become path segments, so reject anything that is not a plain ULID (no `..`, no `/`).
  if (!IdSchema.safeParse(chapterId).success) {
    throw new Error('Refusing to build a file path from a non-ULID chapter id.');
  }
}

function ensured(directory: Directory): Directory {
  directory.create({ intermediates: true, idempotent: true });
  return directory;
}

export function coversDirectory(): Directory {
  return ensured(new Directory(Paths.document, 'covers'));
}

export function previewsDirectory(): Directory {
  return ensured(new Directory(Paths.document, 'previews'));
}

export function chapterSourcesDirectory(chapterId: string): Directory {
  assertChapterId(chapterId);
  return ensured(new Directory(Paths.document, 'sources', chapterId));
}

export function chapterAudioDirectory(chapterId: string): Directory {
  assertChapterId(chapterId);
  return ensured(new Directory(Paths.document, 'audio', chapterId));
}

/** Creates or overwrites the file with the given bytes. */
export function writeBytes(file: File, bytes: Uint8Array): void {
  file.create({ intermediates: true, overwrite: true });
  file.write(bytes);
}

export function readBytes(file: File): Promise<Uint8Array> {
  return file.bytes();
}

/** Removes the source and audio directories of one chapter. Missing directories are fine. */
export function deleteChapterFiles(chapterId: string): void {
  assertChapterId(chapterId);
  for (const root of ['sources', 'audio'] as const) {
    const directory = new Directory(Paths.document, root, chapterId);
    if (directory.exists) {
      directory.delete();
    }
  }
}

/** Free space on the device, in bytes. */
export function freeSpaceBytes(): number {
  return Paths.availableDiskSpace;
}

function sizeOf(entry: Directory | File): number {
  if (entry instanceof File) {
    return entry.size ?? 0;
  }
  return entry.list().reduce((sum, child) => sum + sizeOf(child), 0);
}

/** Bytes used by the library, in total and per top-level directory. */
export function bytesUsedByLibrary(): LibraryUsage {
  const byDirectory = {} as Record<LibraryDirectoryName, number>;
  for (const name of LIBRARY_DIRECTORIES) {
    const directory = new Directory(Paths.document, name);
    byDirectory[name] = directory.exists ? sizeOf(directory) : 0;
  }
  const totalBytes = LIBRARY_DIRECTORIES.reduce((sum, name) => sum + byDirectory[name], 0);
  return { totalBytes, byDirectory };
}
