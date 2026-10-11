/*
 * AudioFiles: narration segments as `audio/<chapterId>/<idx>.<ext>` in the library. Writing a
 * segment replaces the file at its index. When a chapter's segments shrink, the files past the new
 * end are deleted too (P1 open issue 5), so a stale segment can never be played.
 */
import type { Id } from '@/core/domain';
import type { AudioFiles } from '@/core/pipeline/ports';

import type { LibraryFiles } from '../library-files';

export const audioDirectory = (chapterId: Id): string => `audio/${chapterId}`;

const SEGMENT_FILE = /^(\d+)\.[a-z0-9]+$/u;

/** Deletes the segment files whose index is `segmentIdx` or higher. */
export async function removeSegmentFilesFrom(
  files: LibraryFiles,
  chapterId: Id,
  segmentIdx: number,
): Promise<void> {
  const dir = audioDirectory(chapterId);
  const names = await files.listNames(dir);
  for (const name of names) {
    const match = SEGMENT_FILE.exec(name);
    if (match && Number(match[1]) >= segmentIdx) {
      await files.removeFile(`${dir}/${name}`);
    }
  }
}

export function createAudioFiles(files: LibraryFiles): AudioFiles {
  return {
    async write(chapterId, segmentIdx, bytes, ext) {
      return files.write(`${audioDirectory(chapterId)}/${segmentIdx}.${ext}`, bytes);
    },
    async remove(chapterId) {
      await files.removeDirectory(audioDirectory(chapterId));
    },
  };
}
